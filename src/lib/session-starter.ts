export type SessionStartOptions = {
  signedUrl: string;
  connectionType: "websocket";
  onConnect: () => void;
  onError: (message: string) => void;
  /** Fired when a connected session ends. */
  onDisconnect: () => void;
  /** A start that fails reports `{ status: "disconnected" }` here instead of onDisconnect. */
  onStatusChange: (event: { status: string }) => void;
};

export type StartOutcome = { status: "connected" } | { status: "busy" } | { status: "failed"; message: string };

/**
 * idle → starting → active → stopping → idle
 *            └─ timeout / error ─┘
 * "stopping" lasts until the SDK confirms the session is gone; no timer releases it.
 */
export type StarterPhase = "idle" | "starting" | "active" | "stopping";

type Deps = {
  getSignedUrl: () => Promise<string>;
  /** The SDK's startSession returns void; progress arrives via the callbacks in SessionStartOptions. */
  startSession: (options: SessionStartOptions) => void;
  /** Ends the active or pending SDK session. */
  endSession: () => void;
  timeoutMs?: number;
  onPhaseChange?: (phase: StarterPhase) => void;
};

export type SessionStarter = {
  start(): Promise<StartOutcome>;
  stop(): void;
  phase(): StarterPhase;
};

export const TIMEOUT_MESSAGE = "Timed out connecting to the trainer";
export const CLOSED_MESSAGE = "Connection closed before the trainer was ready";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Owns the lifecycle of at most one voice session.
 *
 * The lock is taken synchronously, so rapid clicks can't mint a second signed url or open a second
 * session. It is released only once the SDK confirms the current session is torn down (onDisconnect,
 * or status "disconnected" for a failed start). After a timeout, error or stop(), the session is
 * ended and the starter stays "stopping" until that confirmation arrives, so a retry can never
 * overlap a session that may still connect. If the SDK never confirms, only a page reload clears it.
 */
export function createSessionStarter({ getSignedUrl, startSession, endSession, timeoutMs = 15_000, onPhaseChange }: Deps): SessionStarter {
  let phase: StarterPhase = "idle";
  /** Ends the attempt that holds the lock, if any. */
  let stopCurrent: (() => void) | undefined;

  function setPhase(next: StarterPhase) {
    if (phase === next) return;
    phase = next;
    onPhaseChange?.(next);
  }

  function release() {
    stopCurrent = undefined;
    setPhase("idle");
  }

  function runAttempt(signedUrl: string): Promise<StartOutcome> {
    return new Promise<StartOutcome>((resolve) => {
      let connected = false;
      let tornDown = false;
      /** Set once we've given up on (or ended) this attempt; resolved when teardown is confirmed. */
      let pendingOutcome: StartOutcome | undefined;
      let done = false;

      const settle = () => {
        if (done || !tornDown || !pendingOutcome) return;
        done = true;
        release();
        if (pendingOutcome.status !== "connected") resolve(pendingOutcome);
      };

      /** Stop this attempt: end the SDK session (unless it's already gone) and wait for confirmation. */
      const shutDown = (outcome: StartOutcome) => {
        if (pendingOutcome) return;
        pendingOutcome = outcome;
        clearTimeout(connectTimer);
        if (!tornDown) {
          setPhase("stopping");
          endSession();
        }
        settle();
      };

      const onTornDown = () => {
        if (tornDown) return;
        tornDown = true;
        if (connected && !pendingOutcome) {
          // A live session that ended on its own (agent hung up, network drop).
          pendingOutcome = { status: "connected" };
        } else if (!pendingOutcome) {
          // A start that closed before connecting. The SDK normally follows with onError carrying
          // the reason; give it one tick, then fail with a generic message.
          setTimeout(() => shutDown({ status: "failed", message: CLOSED_MESSAGE }), 0);
        }
        settle();
      };

      const connectTimer = setTimeout(() => shutDown({ status: "failed", message: TIMEOUT_MESSAGE }), timeoutMs);
      stopCurrent = () => shutDown({ status: "connected" });

      try {
        startSession({
          signedUrl,
          connectionType: "websocket",
          onConnect: () => {
            if (done || tornDown) return;
            if (pendingOutcome) {
              // Connected after we gave up on it: it still holds the lock, so end it again.
              endSession();
              return;
            }
            connected = true;
            clearTimeout(connectTimer);
            setPhase("active");
            resolve({ status: "connected" });
          },
          onError: (message) => {
            if (!done && !connected) shutDown({ status: "failed", message });
          },
          onDisconnect: onTornDown,
          onStatusChange: ({ status }) => {
            if (status === "disconnected") onTornDown();
          },
        });
      } catch (error) {
        // Nothing was started, so there is nothing to tear down.
        tornDown = true;
        shutDown({ status: "failed", message: messageOf(error) });
      }
    });
  }

  return {
    phase: () => phase,
    async start() {
      if (phase !== "idle") return { status: "busy" };
      setPhase("starting");

      let signedUrl: string;
      try {
        signedUrl = await getSignedUrl();
      } catch (error) {
        release();
        return { status: "failed", message: messageOf(error) };
      }
      return runAttempt(signedUrl);
    },
    stop() {
      if (phase === "active") stopCurrent?.();
    },
  };
}
