export type SessionStartOptions = {
  signedUrl: string;
  connectionType: "websocket";
  onConnect: () => void;
  onError: (message: string) => void;
  onDisconnect: () => void;
};

export type StartOutcome = { status: "connected" } | { status: "busy" } | { status: "failed"; message: string };

/**
 * idle → starting → active → idle (on disconnect or stop)
 *            └─ timeout → draining → idle (once the cancelled session reports back, or after drainMs)
 */
export type StarterPhase = "idle" | "starting" | "draining" | "active";

type Deps = {
  getSignedUrl: () => Promise<string>;
  /** The SDK's startSession returns void; progress arrives via onConnect / onError / onDisconnect. */
  startSession: (options: SessionStartOptions) => void;
  /** Ends the active or pending SDK session. */
  endSession: () => void;
  timeoutMs?: number;
  /** Upper bound on waiting for a timed-out session to report its teardown before allowing a retry. */
  drainMs?: number;
};

export type SessionStarter = {
  start(): Promise<StartOutcome>;
  stop(): void;
  phase(): StarterPhase;
};

export const TIMEOUT_MESSAGE = "Timed out connecting to the trainer";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Owns the lifecycle of at most one voice session. The lock is taken synchronously, so rapid
 * clicks can't mint a second signed url or open a second session. Each attempt only acts on its
 * own callbacks while it still owns the lock; a timed-out attempt is ended and drained before
 * another attempt may start, and a session that connects after being abandoned is ended.
 */
export function createSessionStarter({
  getSignedUrl,
  startSession,
  endSession,
  timeoutMs = 15_000,
  drainMs = 3_000,
}: Deps): SessionStarter {
  let phase: StarterPhase = "idle";
  let owner = 0; // id of the attempt holding the lock; 0 = nobody
  let nextId = 0;

  function release(id: number) {
    if (owner !== id) return;
    owner = 0;
    phase = "idle";
  }

  function runAttempt(id: number, signedUrl: string): Promise<StartOutcome> {
    return new Promise<StartOutcome>((resolve) => {
      let state: "pending" | "connected" | "timedOut" | "done" = "pending";
      let drainTimer: ReturnType<typeof setTimeout> | undefined;

      const fail = (message: string) => {
        if (state !== "pending") return;
        state = "done";
        clearTimeout(connectTimer);
        release(id);
        resolve({ status: "failed", message });
      };

      const finishDrain = () => {
        if (state !== "timedOut") return;
        state = "done";
        clearTimeout(drainTimer);
        release(id);
        resolve({ status: "failed", message: TIMEOUT_MESSAGE });
      };

      const connectTimer = setTimeout(() => {
        if (state !== "pending") return;
        state = "timedOut";
        phase = "draining";
        endSession();
        drainTimer = setTimeout(finishDrain, drainMs);
      }, timeoutMs);

      try {
        startSession({
          signedUrl,
          connectionType: "websocket",
          onConnect: () => {
            if (state === "pending") {
              state = "connected";
              clearTimeout(connectTimer);
              phase = "active";
              resolve({ status: "connected" });
            } else if (state === "timedOut" || (state === "done" && owner === 0)) {
              // Connected after we gave up on it: end it rather than leave an orphan session.
              // If a newer attempt owns the lock, leave it alone; the SDK is already ending this one.
              endSession();
            }
          },
          onError: (message) => fail(message),
          onDisconnect: () => {
            if (state === "pending") fail("Connection closed before the trainer was ready");
            else if (state === "timedOut") finishDrain();
            else if (state === "connected") {
              state = "done";
              release(id);
            }
          },
        });
      } catch (error) {
        fail(messageOf(error));
      }
    });
  }

  return {
    phase: () => phase,
    async start() {
      if (phase !== "idle") return { status: "busy" };
      const id = ++nextId;
      owner = id;
      phase = "starting";

      let signedUrl: string;
      try {
        signedUrl = await getSignedUrl();
      } catch (error) {
        release(id);
        return { status: "failed", message: messageOf(error) };
      }
      return runAttempt(id, signedUrl);
    },
    stop() {
      endSession();
      if (phase === "active") release(owner);
    },
  };
}
