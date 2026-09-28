import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionStarter, type SessionStartOptions } from "./session-starter";

const TIMEOUT = 1000;
const DRAIN = 500;

/** A controllable fake of the SDK: records each startSession call so tests can fire its callbacks. */
function harness(overrides: { getSignedUrl?: () => Promise<string> } = {}) {
  const sessions: SessionStartOptions[] = [];
  const startSession = vi.fn((options: SessionStartOptions) => {
    sessions.push(options);
  });
  const endSession = vi.fn();
  const getSignedUrl = vi.fn(overrides.getSignedUrl ?? (async () => "wss://signed"));
  const starter = createSessionStarter({ getSignedUrl, startSession, endSession, timeoutMs: TIMEOUT, drainMs: DRAIN });
  return { starter, sessions, startSession, endSession, getSignedUrl };
}

/** Lets the awaited signed-url fetch settle so startSession has been called. */
const flush = () => vi.advanceTimersByTimeAsync(0);

describe("createSessionStarter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("connects on onConnect, blocks new starts while active, and frees up on disconnect", async () => {
    const h = harness();
    const outcome = h.starter.start();
    await flush();
    expect(h.sessions[0]).toMatchObject({ signedUrl: "wss://signed", connectionType: "websocket" });

    h.sessions[0]?.onConnect();
    await expect(outcome).resolves.toEqual({ status: "connected" });
    expect(h.starter.phase()).toBe("active");
    await expect(h.starter.start()).resolves.toEqual({ status: "busy" });

    h.sessions[0]?.onDisconnect();
    expect(h.starter.phase()).toBe("idle");
    const again = h.starter.start();
    await flush();
    h.sessions[1]?.onConnect();
    await expect(again).resolves.toEqual({ status: "connected" });
  });

  it("double-start: rapid clicks fetch one signed url and open one session", async () => {
    const h = harness();
    const first = h.starter.start();
    const second = h.starter.start();
    const third = h.starter.start();
    await expect(second).resolves.toEqual({ status: "busy" });
    await expect(third).resolves.toEqual({ status: "busy" });

    await flush();
    h.sessions[0]?.onConnect();
    await expect(first).resolves.toEqual({ status: "connected" });
    expect(h.getSignedUrl).toHaveBeenCalledTimes(1);
    expect(h.startSession).toHaveBeenCalledTimes(1);
  });

  it("timeout: ends the underlying session and stays locked until it has drained", async () => {
    const h = harness();
    let settled = false;
    const outcome = h.starter.start().then((o) => {
      settled = true;
      return o;
    });
    await flush();

    await vi.advanceTimersByTimeAsync(TIMEOUT);
    expect(h.endSession).toHaveBeenCalledTimes(1);
    expect(h.starter.phase()).toBe("draining");
    expect(settled).toBe(false);
    await expect(h.starter.start()).resolves.toEqual({ status: "busy" });

    h.sessions[0]?.onDisconnect();
    await expect(outcome).resolves.toEqual({ status: "failed", message: "Timed out connecting to the trainer" });
    expect(h.starter.phase()).toBe("idle");
  });

  it("timeout: releases the lock after the drain cap even if the SDK never reports back", async () => {
    const h = harness();
    const outcome = h.starter.start();
    await flush();
    await vi.advanceTimersByTimeAsync(TIMEOUT + DRAIN);
    await expect(outcome).resolves.toEqual({ status: "failed", message: "Timed out connecting to the trainer" });
    expect(h.starter.phase()).toBe("idle");
  });

  it("late onConnect during drain does not count as connected and is ended again", async () => {
    const h = harness();
    const outcome = h.starter.start();
    await flush();
    await vi.advanceTimersByTimeAsync(TIMEOUT);

    h.sessions[0]?.onConnect();
    expect(h.endSession).toHaveBeenCalledTimes(2);
    expect(h.starter.phase()).toBe("draining");

    h.sessions[0]?.onDisconnect();
    await expect(outcome).resolves.toEqual({ status: "failed", message: "Timed out connecting to the trainer" });
    expect(h.starter.phase()).toBe("idle");
  });

  it("late onConnect after the drain cap, while idle, is ended as an orphan", async () => {
    const h = harness();
    const outcome = h.starter.start();
    await flush();
    await vi.advanceTimersByTimeAsync(TIMEOUT + DRAIN);
    await outcome;

    h.sessions[0]?.onConnect();
    expect(h.endSession).toHaveBeenCalledTimes(2);
    expect(h.starter.phase()).toBe("idle");
  });

  it("retry after timeout works, and the stale attempt's callbacks cannot affect it", async () => {
    const h = harness();
    const first = h.starter.start();
    await flush();
    await vi.advanceTimersByTimeAsync(TIMEOUT + DRAIN);
    await expect(first).resolves.toMatchObject({ status: "failed" });

    const retry = h.starter.start();
    await flush();
    expect(h.startSession).toHaveBeenCalledTimes(2);
    const endCallsBefore = h.endSession.mock.calls.length;

    // Stale callbacks from attempt #1 arrive while #2 is starting: ignored, #2 not ended.
    h.sessions[0]?.onConnect();
    h.sessions[0]?.onError("stale failure");
    h.sessions[0]?.onDisconnect();
    expect(h.endSession).toHaveBeenCalledTimes(endCallsBefore);
    expect(h.starter.phase()).toBe("starting");

    h.sessions[1]?.onConnect();
    await expect(retry).resolves.toEqual({ status: "connected" });
    h.sessions[0]?.onDisconnect();
    expect(h.starter.phase()).toBe("active");
  });

  it("fails cleanly when the signed url cannot be fetched, and allows a retry", async () => {
    let calls = 0;
    const h = harness({
      getSignedUrl: async () => {
        calls += 1;
        if (calls === 1) throw new Error("Too many attempts, wait a minute and try again");
        return "wss://ok";
      },
    });
    await expect(h.starter.start()).resolves.toEqual({
      status: "failed",
      message: "Too many attempts, wait a minute and try again",
    });
    expect(h.startSession).not.toHaveBeenCalled();
    expect(h.starter.phase()).toBe("idle");

    const retry = h.starter.start();
    await flush();
    h.sessions[0]?.onConnect();
    await expect(retry).resolves.toEqual({ status: "connected" });
  });

  it("fails when the SDK reports onError (e.g. mic permission denied)", async () => {
    const h = harness();
    const outcome = h.starter.start();
    await flush();
    h.sessions[0]?.onError("Permission denied");
    await expect(outcome).resolves.toEqual({ status: "failed", message: "Permission denied" });
    expect(h.starter.phase()).toBe("idle");
  });

  it("fails when startSession throws synchronously", async () => {
    const h = harness();
    h.startSession.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    await expect(h.starter.start()).resolves.toEqual({ status: "failed", message: "boom" });
    expect(h.starter.phase()).toBe("idle");
  });

  it("stop() ends an active session and frees the lock", async () => {
    const h = harness();
    const outcome = h.starter.start();
    await flush();
    h.sessions[0]?.onConnect();
    await outcome;

    h.starter.stop();
    expect(h.endSession).toHaveBeenCalledTimes(1);
    expect(h.starter.phase()).toBe("idle");
  });
});
