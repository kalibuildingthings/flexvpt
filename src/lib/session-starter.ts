export type SessionStartOptions = {
  signedUrl: string;
  connectionType: "websocket";
  onConnect: () => void;
  onError: (message: string) => void;
};

export type StartOutcome = { status: "connected" } | { status: "busy" } | { status: "failed"; message: string };

type Deps = {
  getSignedUrl: () => Promise<string>;
  /** The SDK's startSession returns void; success and failure arrive via onConnect / onError. */
  startSession: (options: SessionStartOptions) => void;
  timeoutMs?: number;
};

export type SessionStarter = { start(): Promise<StartOutcome>; isStarting(): boolean };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Starts one voice session at a time. The lock is taken synchronously on the first call,
 * so rapid clicks can't mint a second signed url or open a second session.
 */
export function createSessionStarter({ getSignedUrl, startSession, timeoutMs = 15_000 }: Deps): SessionStarter {
  let starting = false;

  function connect(signedUrl: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out connecting to the trainer")), timeoutMs);
      const settle = (fn: () => void) => {
        clearTimeout(timer);
        fn();
      };
      try {
        startSession({
          signedUrl,
          connectionType: "websocket",
          onConnect: () => settle(resolve),
          onError: (message) => settle(() => reject(new Error(message))),
        });
      } catch (error) {
        settle(() => reject(error));
      }
    });
  }

  return {
    isStarting: () => starting,
    async start() {
      if (starting) return { status: "busy" };
      starting = true;
      try {
        await connect(await getSignedUrl());
        return { status: "connected" };
      } catch (error) {
        return { status: "failed", message: messageOf(error) };
      } finally {
        starting = false;
      }
    },
  };
}
