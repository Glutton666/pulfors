const loopStops: jest.Mock[] = [];
const renderedEnded: Array<() => void> = [];
const context = { currentTime: 10, sampleRate: 48000 };

jest.mock("@/lib/audio-renderer", () => ({
  getWebAudioContext: jest.fn(() => context),
  playWebRenderedLoop: jest.fn((
    _pcm: Float32Array,
    onEnded?: () => void,
  ) => {
    const stop = jest.fn();
    loopStops.push(stop);
    renderedEnded.push(onEnded ?? (() => {}));
    return {
      stop,
      isRunning: () => true,
      setVolume: jest.fn(),
      getPositionSeconds: () => 0,
      getNextBoundaryTime: () => 12,
      getDurationSeconds: () => 2,
    };
  }),
  scheduleWebClickAt: jest.fn(() => null),
}));

import { createAudioOutputOwner } from "@/lib/audio-output-owner";
import { createWebAudioOutput } from "@/lib/web-audio-output";

describe("web audio output handoff", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    loopStops.length = 0;
    renderedEnded.length = 0;
    context.currentTime = 10;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("cancels both a scheduled retiring loop and its replacement on global stop", () => {
    const adapter = createWebAudioOutput();
    const owner = createAudioOutputOwner({ adapter });
    owner.publish(adapter.rendered(new Float32Array([1])));
    owner.publish(adapter.rendered(new Float32Array([2])), 12);

    owner.stop();

    expect(loopStops[0].mock.calls).toEqual([[12], [undefined]]);
    expect(loopStops[1]).toHaveBeenCalledWith(undefined);
    expect(owner.snapshot().retiringCount).toBe(0);
  });

  it("finalizes a retiring loop when its scheduled boundary completes", () => {
    const adapter = createWebAudioOutput();
    const owner = createAudioOutputOwner({ adapter });
    owner.publish(adapter.rendered(new Float32Array([1])));
    owner.publish(adapter.rendered(new Float32Array([2])), 12);

    jest.advanceTimersByTime(2020);

    expect(loopStops[0].mock.calls).toEqual([[12], [undefined]]);
    expect(owner.snapshot().retiringCount).toBe(0);
  });
});