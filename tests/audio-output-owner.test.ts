import { createAudioOutputOwner, publishAudioOutput } from "@/lib/audio-output-owner";

describe("audio output owner", () => {
  const resource = () => ({
    stop: jest.fn(),
    release: jest.fn(),
  });

  it("replaces active output and releases the previous resource once", () => {
    const owner = createAudioOutputOwner({ adapter: {} as any });
    const first = resource();
    const second = resource();
    expect(publishAudioOutput(owner, first)).toBe(true);
    expect(publishAudioOutput(owner, second)).toBe(true);
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(first.release).toHaveBeenCalledTimes(1);
    owner.stop();
    owner.stop();
    expect(second.stop).toHaveBeenCalledTimes(1);
    expect(second.release).toHaveBeenCalledTimes(1);
  });

  it("commits and discards handoff resources without double release", () => {
    const owner = createAudioOutputOwner({ adapter: {} as any });
    const active = resource();
    const handoff = resource();
    owner.publish(active);
    owner.publishHandoff(handoff);
    expect(owner.commitHandoff()).toBe(true);
    expect(active.release).toHaveBeenCalledTimes(1);
    expect(handoff.release).not.toHaveBeenCalled();
    owner.dispose();
    owner.dispose();
    expect(handoff.release).toHaveBeenCalledTimes(1);
  });

  it("releases tracked one-shot resources on stop and immediately rejects after dispose", () => {
    const owner = createAudioOutputOwner({ adapter: {} as any });
    const oneShot = resource();
    owner.trackRealtime(oneShot);
    owner.dispose();
    expect(oneShot.stop).toHaveBeenCalledTimes(1);
    expect(oneShot.release).toHaveBeenCalledTimes(1);
    const late = resource();
    expect(owner.trackRealtime(late)).toBeNull();
    expect(late.release).toHaveBeenCalledTimes(1);
  });

  it("retains a boundary-replaced output so an earlier stop can still cancel it", () => {
    const owner = createAudioOutputOwner({ adapter: {} as any });
    const previous = resource();
    const next = resource();
    owner.publish(previous);
    owner.publish(next, 42);
    expect(previous.stop).toHaveBeenCalledWith(42);
    expect(owner.snapshot().retiringCount).toBe(1);

    owner.stop();

    expect(previous.stop).toHaveBeenLastCalledWith(undefined);
    expect(previous.release).toHaveBeenCalledTimes(1);
    expect(next.release).toHaveBeenCalledTimes(1);
    expect(owner.snapshot().retiringCount).toBe(0);
  });

  it("releases a retired output after its scheduled boundary completes", () => {
    const owner = createAudioOutputOwner({ adapter: {} as any });
    let finish!: () => void;
    const previous = {
      stop: jest.fn(),
      release: jest.fn(),
      onEnded: jest.fn((listener: () => void) => { finish = listener; }),
    };
    owner.publish(previous);
    owner.publish(resource(), 42);

    finish();

    expect(owner.snapshot().retiringCount).toBe(0);
    expect(previous.release).toHaveBeenCalledTimes(1);
  });

  it("stops managed resources without releasing them until disposal", () => {
    const owner = createAudioOutputOwner({ adapter: {} as any });
    const key = {};
    const pool = resource();
    owner.manage(key, pool);

    owner.stop();
    expect(pool.stop).toHaveBeenCalledTimes(1);
    expect(pool.release).not.toHaveBeenCalled();

    owner.dispose();
    expect(pool.release).toHaveBeenCalledTimes(1);
  });
});