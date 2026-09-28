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
 *            └─ timeout / error ─┘  │
 *                                   └─ no confirmation in time → stuck ─ confirmation / forceEnd() → idle
 * No timer ever releases the lock: "stuck" is still locked and only asks the user to force end.
 */
export type StarterPhase = "idle" | "starting" | "active" | "stopping" | "stuck";

type Deps = {
  getSignedUrl: () => Promise<string>;
  /** The SDK's startSession returns void; progress arrives via the callbacks in SessionStartOptions. */
  startSession: (options: SessionStartOptions) => void;
  /** Ends the active or pending SDK session. */
  endSession: () => void;
  timeoutMs?: number;
  /** How long "stopping" may wait for teardown confirmation before going "stuck". */
  teardownTimeoutMs?: number;
  onPhaseChange?: (phase: StarterPhase) => void;
};

export type SessionStarter = {
  start(): Promise<StartOutcome>;
  stop(): void;
  /** Only when "stuck": best-effort hard teardown, then release the lock. */
  forceEnd(): void;
  phase(): StarterPhase;
};

export const TIMEOUT_MESSAGE = "Timed out connecting to the trainer";
export const CLOSED_MESSAGE = "Connection closed before the trainer was ready";
export const FORCE_ENDED_MESSAGE = "Session was force-ended";

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
 * overlap a session that may still connect. If no confirmation arrives within teardownTimeoutMs the
 * starter goes "stuck" (still locked) and only an explicit forceEnd() releases it.
 */
export function createSessionStarter({
  getSignedUrl,
  startSession,
  endSession,
  timeoutMs = 15_000,
  teardownTimeoutMs = 15_000,
  onPhaseChange,
}: Deps): SessionStarter {
  let phase: StarterPhase = "idle";
  /** Ends the attempt that holds the lock, if any. */
  let stopCurrent: (() => void) | undefined;
  /** Abandons the attempt that holds the lock, if any. */
  let forceCurrent: (() => void) | undefined;

  /** endSession can throw if the socket is already gone; teardown is still confirmed via callbacks. */
  function tryEndSession() {
    try {
      endSession();
    } catch (error) {
      console.warn("[session] endSession failed", error);
    }
  }

  function setPhase(next: StarterPhase) {
    if (phase === next) return;
    phase = next;
    onPhaseChange?.(next);
  }

  function release() {
    stopCurrent = undefined;
    forceCurrent = undefined;
    setPhase("idle");
  }

  function runAttempt(signedUrl: string): Promise<StartOutcome> {
    return new Promise<StartOutcome>((resolve) => {
      let connected = false;
      let tornDown = false;
      /** Set once we've given up on (or ended) this attempt; resolved when teardown is confirmed. */
      let pendingOutcome: StartOutcome | undefined;
      let done = false;
      let teardownTimer: ReturnType<typeof setTimeout> | undefined;

      const finish = (outcome: StartOutcome) => {
        done = true;
        clearTimeout(connectTimer);
        clearTimeout(teardownTimer);
        release();
        if (outcome.status !== "connected") resolve(outcome);
      };

      const settle = () => {
        if (done || !tornDown || !pendingOutcome) return;
        finish(pendingOutcome);
      };

      /** Stop this attempt: end the SDK session (unless it's already gone) and wait for confirmation. */
      const shutDown = (outcome: StartOutcome) => {
        if (pendingOutcome) return;
        pendingOutcome = outcome;
        clearTimeout(connectTimer);
        if (!tornDown) {
          setPhase("stopping");
          teardownTimer = setTimeout(() => {
            if (!done) setPhase("stuck");
          }, teardownTimeoutMs);
          tryEndSession();
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
      forceCurrent = () => {
        // Abandon this attempt: `done` makes every later callback from it a no-op.
        tryEndSession();
        finish(pendingOutcome?.status === "connected" ? pendingOutcome : { status: "failed", message: FORCE_ENDED_MESSAGE });
      };

      try {
        startSession({
          signedUrl,
          connectionType: "websocket",
          onConnect: () => {
            if (done || tornDown) return;
            if (pendingOutcome) {
              // Connected after we gave up on it: it still holds the lock, so end it again.
              tryEndSession();
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
    forceEnd() {
      if (phase === "stuck") forceCurrent?.();
    },
  };
}
