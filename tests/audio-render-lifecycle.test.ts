import { createAudioRenderLifecycle } from "@/lib/audio-render-lifecycle";

describe("audio render lifecycle", () => {
  it("transfers a prepared resource exactly once on commit", () => {
    const lifecycle = createAudioRenderLifecycle();
    const dispose = jest.fn();
    const publish = jest.fn();
    const result = lifecycle.start().complete({ id: 1 }, dispose);

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    expect(result.prepared.commit(publish)).toBe(true);
    expect(result.prepared.commit(publish)).toBe(false);
    result.prepared.discard();
    expect(publish).toHaveBeenCalledTimes(1);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("discards exactly once when publication throws", () => {
    const lifecycle = createAudioRenderLifecycle();
    const dispose = jest.fn();
    const result = lifecycle.start().complete({ id: 1 }, dispose);
    if (result.status !== "completed") throw new Error("expected prepared output");

    expect(() => result.prepared.commit(() => {
      throw new Error("publish failed");
    })).toThrow("publish failed");
    result.prepared.discard();
    lifecycle.cancel();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("discards prepared output once when a newer render starts", () => {
    const lifecycle = createAudioRenderLifecycle();
    const dispose = jest.fn();
    const first = lifecycle.start().complete({ id: 1 }, dispose);
    expect(first.status).toBe("completed");

    lifecycle.start();
    if (first.status !== "completed") return;
    expect(first.prepared.commit(jest.fn())).toBe(false);
    first.prepared.discard();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("distinguishes cancellation, supersession, and failure", () => {
    const lifecycle = createAudioRenderLifecycle();
    const cancelled = lifecycle.start();
    lifecycle.cancel();
    expect(cancelled.interruption()).toEqual({ status: "cancelled" });

    const superseded = lifecycle.start();
    lifecycle.start();
    expect(superseded.interruption()).toEqual({ status: "superseded" });

    const error = new Error("decode failed");
    expect(lifecycle.start().fail(error)).toEqual({ status: "failed", error });
  });

  it("disposes late output after cancellation and is idempotent on unmount", () => {
    const lifecycle = createAudioRenderLifecycle();
    const dispose = jest.fn();
    const session = lifecycle.start();
    lifecycle.dispose();
    lifecycle.dispose();

    expect(session.complete({ id: 1 }, dispose)).toEqual({ status: "cancelled" });
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(lifecycle.start().interruption()).toEqual({ status: "cancelled" });
  });

  it("supports StrictMode reactivation but rejects starts after final disposal", () => {
    const lifecycle = createAudioRenderLifecycle();
    lifecycle.dispose();
    expect(lifecycle.start().interruption()).toEqual({ status: "cancelled" });

    lifecycle.activate();
    const replaySession = lifecycle.start();
    expect(replaySession.isCurrent()).toBe(true);

    lifecycle.dispose();
    expect(replaySession.isCurrent()).toBe(false);
    expect(lifecycle.start().interruption()).toEqual({ status: "cancelled" });
  });

  it("assigns process-wide unique ids across lifecycle instances", () => {
    const first = createAudioRenderLifecycle();
    const second = createAudioRenderLifecycle();

    const firstId = first.start().id;
    const secondId = second.start().id;

    expect(firstId).not.toBe(secondId);
    expect(secondId).toBeGreaterThan(firstId);
  });
});