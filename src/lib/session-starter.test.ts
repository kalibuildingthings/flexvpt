import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLOSED_MESSAGE,
  createSessionStarter,
  FORCE_ENDED_MESSAGE,
  TIMEOUT_MESSAGE,
  type SessionStartOptions,
  type StarterPhase,
} from "./session-starter";

const TIMEOUT = 1000;
const TEARDOWN_TIMEOUT = 2000;

/** A controllable fake of the SDK: records each startSession call so tests can fire its callbacks. */
function harness(overrides: { getSignedUrl?: () => Promise<string>; endSession?: () => void } = {}) {
  const sessions: SessionStartOptions[] = [];
  const phases: StarterPhase[] = [];
  const startSession = vi.fn((options: SessionStartOptions) => {
    sessions.push(options);
  });
  const endSession = vi.fn(overrides.endSession ?? (() => {}));
  const getSignedUrl = vi.fn(overrides.getSignedUrl ?? (async () => "wss://signed"));
  const starter = createSessionStarter({
    getSignedUrl,
    startSession,
    endSession,
    timeoutMs: TIMEOUT,
    teardownTimeoutMs: TEARDOWN_TIMEOUT,
    onPhaseChange: (phase) => phases.push(phase),
  });
  return { starter, sessions, phases, startSession, endSession, getSignedUrl };
}

/** Lets the awaited signed-url fetch settle so startSession has been called. */
const flush = () => vi.advanceTimersByTimeAsync(0);

/** Tracks whether a promise has settled, without awaiting it. */
function track<T>(promise: Promise<T>) {
  const box: { settled: boolean; value?: T } = { settled: false };
  void promise.then((value) => {
    box.settled = true;
    box.value = value;
  });
  return box;
}

describe("createSessionStarter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("connects on onConnect and reports phases", async () => {
    const h = harness();
    const outcome = h.starter.start();
    await flush();
    expect(h.sessions[0]).toMatchObject({ signedUrl: "wss://signed", connectionType: "websocket" });

    h.sessions[0]?.onConnect();
    await expect(outcome).resolves.toEqual({ status: "connected" });
    expect(h.starter.phase()).toBe("active");
    expect(h.phases).toEqual(["starting", "active"]);
  });

  it("double-start: rapid clicks fetch one signed url and open one session", async () => {
    const h = harness();
    const first = h.starter.start();
    await expect(h.starter.start()).resolves.toEqual({ status: "busy" });
    await expect(h.starter.start()).resolves.toEqual({ status: "busy" });

    await flush();
    h.sessions[0]?.onConnect();
    await expect(first).resolves.toEqual({ status: "connected" });
    expect(h.getSignedUrl).toHaveBeenCalledTimes(1);
    expect(h.startSession).toHaveBeenCalledTimes(1);
  });

  describe("stop()", () => {
    it("stays locked until the SDK confirms the disconnect", async () => {
      const h = harness();
      const outcome = h.starter.start();
      await flush();
      h.sessions[0]?.onConnect();
      await outcome;

      h.starter.stop();
      expect(h.endSession).toHaveBeenCalledTimes(1);
      expect(h.starter.phase()).toBe("stopping");
      await expect(h.starter.start()).resolves.toEqual({ status: "busy" });

      h.sessions[0]?.onDisconnect();
      expect(h.starter.phase()).toBe("idle");
      const again = h.starter.start();
      await flush();
      h.sessions[1]?.onConnect();
      await expect(again).resolves.toEqual({ status: "connected" });
    });

    it("an SDK-initiated disconnect (e.g. agent hung up) frees the lock", async () => {
      const h = harness();
      const outcome = h.starter.start();
      await flush();
      h.sessions[0]?.onConnect();
      await outcome;

      h.sessions[0]?.onDisconnect();
      expect(h.starter.phase()).toBe("idle");
      expect(h.endSession).not.toHaveBeenCalled();
    });
  });

  describe("timeout", () => {
    it("ends the session and refuses retries until teardown is confirmed, however long that takes", async () => {
      const h = harness();
      const outcome = track(h.starter.start());
      await flush();

      await vi.advanceTimersByTimeAsync(TIMEOUT);
      expect(h.endSession).toHaveBeenCalledTimes(1);
      expect(h.starter.phase()).toBe("stopping");

      await vi.advanceTimersByTimeAsync(60_000); // no time-based release, only "stuck"
      expect(outcome.settled).toBe(false);
      expect(h.starter.phase()).toBe("stuck");
      await expect(h.starter.start()).resolves.toEqual({ status: "busy" });
      expect(h.startSession).toHaveBeenCalledTimes(1);

      h.sessions[0]?.onStatusChange({ status: "disconnected" });
      await flush();
      expect(outcome.value).toEqual({ status: "failed", message: TIMEOUT_MESSAGE });
      expect(h.starter.phase()).toBe("idle");
    });

    it("a late onConnect after timeout is not treated as connected and is ended again", async () => {
      const h = harness();
      const outcome = track(h.starter.start());
      await flush();
      await vi.advanceTimersByTimeAsync(TIMEOUT);

      h.sessions[0]?.onConnect();
      expect(h.endSession).toHaveBeenCalledTimes(2);
      expect(h.starter.phase()).toBe("stopping");
      await flush();
      expect(outcome.settled).toBe(false);

      h.sessions[0]?.onDisconnect();
      await flush();
      expect(outcome.value).toEqual({ status: "failed", message: TIMEOUT_MESSAGE });
    });

    it("a retry after confirmed teardown works and old callbacks cannot touch it", async () => {
      const h = harness();
      const first = h.starter.start();
      await flush();
      await vi.advanceTimersByTimeAsync(TIMEOUT);
      h.sessions[0]?.onDisconnect();
      await expect(first).resolves.toMatchObject({ status: "failed" });

      const retry = h.starter.start();
      await flush();
      expect(h.startSession).toHaveBeenCalledTimes(2);
      const endCalls = h.endSession.mock.calls.length;

      h.sessions[0]?.onConnect();
      h.sessions[0]?.onError("stale");
      h.sessions[0]?.onDisconnect();
      h.sessions[0]?.onStatusChange({ status: "disconnected" });
      expect(h.endSession).toHaveBeenCalledTimes(endCalls);
      expect(h.starter.phase()).toBe("starting");

      h.sessions[1]?.onConnect();
      await expect(retry).resolves.toEqual({ status: "connected" });
      expect(h.starter.phase()).toBe("active");
    });
  });

  describe("failures", () => {
    it("a failed start that the SDK already tore down frees the lock immediately", async () => {
      const h = harness();
      const outcome = h.starter.start();
      await flush();
      // What the SDK does on a failed start: status "disconnected", then the provider's onError.
      h.sessions[0]?.onStatusChange({ status: "connecting" });
      h.sessions[0]?.onStatusChange({ status: "disconnected" });
      h.sessions[0]?.onError("Permission denied");
      await expect(outcome).resolves.toEqual({ status: "failed", message: "Permission denied" });
      expect(h.starter.phase()).toBe("idle");
      expect(h.endSession).not.toHaveBeenCalled();
    });

    it("a start that closes without any error still fails and frees the lock", async () => {
      const h = harness();
      const outcome = h.starter.start();
      await flush();
      h.sessions[0]?.onStatusChange({ status: "disconnected" });
      await flush();
      await expect(outcome).resolves.toEqual({ status: "failed", message: CLOSED_MESSAGE });
      expect(h.starter.phase()).toBe("idle");
    });

    it("an error before teardown ends the session and waits for confirmation", async () => {
      const h = harness();
      const outcome = track(h.starter.start());
      await flush();
      h.sessions[0]?.onError("Socket error");
      expect(h.endSession).toHaveBeenCalledTimes(1);
      expect(h.starter.phase()).toBe("stopping");
      await flush();
      expect(outcome.settled).toBe(false);

      h.sessions[0]?.onDisconnect();
      await flush();
      expect(outcome.value).toEqual({ status: "failed", message: "Socket error" });
      expect(h.starter.phase()).toBe("idle");
    });

    it("fails cleanly when startSession throws synchronously (nothing was started)", async () => {
      const h = harness();
      h.startSession.mockImplementationOnce(() => {
        throw new Error("boom");
      });
      await expect(h.starter.start()).resolves.toEqual({ status: "failed", message: "boom" });
      expect(h.starter.phase()).toBe("idle");
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
  });

  describe("teardown watchdog", () => {
    /** Starts, connects, then calls stop(); returns the harness mid-teardown. */
    async function stopping() {
      const h = harness();
      const outcome = h.starter.start();
      await flush();
      h.sessions[0]?.onConnect();
      await outcome;
      h.starter.stop();
      return h;
    }

    it("normal teardown: confirmation before the deadline frees the lock and never goes stuck", async () => {
      const h = await stopping();
      await vi.advanceTimersByTimeAsync(TEARDOWN_TIMEOUT - 1);
      h.sessions[0]?.onDisconnect();
      expect(h.starter.phase()).toBe("idle");

      await vi.advanceTimersByTimeAsync(TEARDOWN_TIMEOUT * 5);
      expect(h.phases).toEqual(["starting", "active", "stopping", "idle"]);
    });

    it("no confirmation by the deadline: goes stuck, stays locked, and does not auto-reset", async () => {
      const h = await stopping();
      await vi.advanceTimersByTimeAsync(TEARDOWN_TIMEOUT - 1);
      expect(h.starter.phase()).toBe("stopping");
      await expect(h.starter.start()).resolves.toEqual({ status: "busy" });

      await vi.advanceTimersByTimeAsync(1);
      expect(h.starter.phase()).toBe("stuck");

      await vi.advanceTimersByTimeAsync(60_000);
      expect(h.starter.phase()).toBe("stuck");
      await expect(h.starter.start()).resolves.toEqual({ status: "busy" });
      expect(h.startSession).toHaveBeenCalledTimes(1);
    });

    it("a late confirmation while stuck still frees the lock normally", async () => {
      const h = await stopping();
      await vi.advanceTimersByTimeAsync(TEARDOWN_TIMEOUT);
      h.sessions[0]?.onDisconnect();
      expect(h.starter.phase()).toBe("idle");
    });

    it("forceEnd is ignored unless stuck", async () => {
      const h = await stopping();
      h.starter.forceEnd();
      expect(h.starter.phase()).toBe("stopping");
    });

    it("force end: hard-ends the session, frees the lock, and a new session can start", async () => {
      const h = await stopping();
      await vi.advanceTimersByTimeAsync(TEARDOWN_TIMEOUT);
      const endsBefore = h.endSession.mock.calls.length;

      h.starter.forceEnd();
      expect(h.endSession).toHaveBeenCalledTimes(endsBefore + 1);
      expect(h.starter.phase()).toBe("idle");

      const retry = h.starter.start();
      await flush();
      expect(h.startSession).toHaveBeenCalledTimes(2);

      // The abandoned attempt's late callbacks can't touch the new one.
      h.sessions[0]?.onDisconnect();
      h.sessions[0]?.onConnect();
      expect(h.starter.phase()).toBe("starting");

      h.sessions[1]?.onConnect();
      await expect(retry).resolves.toEqual({ status: "connected" });
      expect(h.starter.phase()).toBe("active");
    });

    it("force end still recovers when the hard teardown throws", async () => {
      const h = harness({
        endSession: () => {
          throw new Error("socket already gone");
        },
      });
      const outcome = h.starter.start();
      await flush();
      await vi.advanceTimersByTimeAsync(TIMEOUT + TEARDOWN_TIMEOUT);
      expect(h.starter.phase()).toBe("stuck");

      h.starter.forceEnd();
      expect(h.starter.phase()).toBe("idle");
      await expect(outcome).resolves.toEqual({ status: "failed", message: FORCE_ENDED_MESSAGE });
    });
  });
});
