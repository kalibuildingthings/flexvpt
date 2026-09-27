import { describe, expect, it, vi } from "vitest";
import { createSessionStarter, type SessionStartOptions } from "./session-starter";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSessionStarter", () => {
  it("resolves connected only after the SDK reports onConnect", async () => {
    let options: SessionStartOptions | undefined;
    const starter = createSessionStarter({
      getSignedUrl: async () => "wss://signed",
      startSession: (o) => {
        options = o;
      },
    });

    const outcome = starter.start();
    await vi.waitFor(() => expect(options).toBeDefined());
    expect(options).toMatchObject({ signedUrl: "wss://signed", connectionType: "websocket" });
    expect(starter.isStarting()).toBe(true);

    options?.onConnect();
    await expect(outcome).resolves.toEqual({ status: "connected" });
    expect(starter.isStarting()).toBe(false);
  });

  it("ignores rapid repeat clicks: one signed url, one session", async () => {
    const url = deferred<string>();
    const getSignedUrl = vi.fn(() => url.promise);
    const startSession = vi.fn((o: SessionStartOptions) => o.onConnect());
    const starter = createSessionStarter({ getSignedUrl, startSession });

    const first = starter.start();
    const second = starter.start();
    const third = starter.start();

    await expect(second).resolves.toEqual({ status: "busy" });
    await expect(third).resolves.toEqual({ status: "busy" });
    url.resolve("wss://signed");
    await expect(first).resolves.toEqual({ status: "connected" });
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it("fails cleanly when the signed url cannot be fetched, and allows a retry", async () => {
    const getSignedUrl = vi.fn().mockRejectedValueOnce(new Error("Too many requests")).mockResolvedValue("wss://ok");
    const starter = createSessionStarter({ getSignedUrl, startSession: (o) => o.onConnect() });

    await expect(starter.start()).resolves.toEqual({ status: "failed", message: "Too many requests" });
    expect(starter.isStarting()).toBe(false);
    await expect(starter.start()).resolves.toEqual({ status: "connected" });
  });

  it("fails when the SDK reports onError (e.g. mic permission denied)", async () => {
    const starter = createSessionStarter({
      getSignedUrl: async () => "wss://signed",
      startSession: (o) => o.onError("Permission denied"),
    });
    await expect(starter.start()).resolves.toEqual({ status: "failed", message: "Permission denied" });
  });

  it("fails when startSession throws synchronously", async () => {
    const starter = createSessionStarter({
      getSignedUrl: async () => "wss://signed",
      startSession: () => {
        throw new Error("boom");
      },
    });
    await expect(starter.start()).resolves.toEqual({ status: "failed", message: "boom" });
  });

  it("times out if the SDK never connects or errors", async () => {
    vi.useFakeTimers();
    try {
      const starter = createSessionStarter({ getSignedUrl: async () => "wss://signed", startSession: () => {}, timeoutMs: 1000 });
      const outcome = starter.start();
      await vi.advanceTimersByTimeAsync(1000);
      await expect(outcome).resolves.toEqual({ status: "failed", message: "Timed out connecting to the trainer" });
      expect(starter.isStarting()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
