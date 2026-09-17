import {
  AUDIO_OUTPUT_CEILING,
  applyAudioToneSnapshot,
  createAudioToneSnapshot,
  readAudioToneSnapshot,
} from "@/lib/audio-tone-snapshot";

describe("audio tone snapshots", () => {
  it("captures sanitized immutable settings without retaining input objects", () => {
    const defaultPosition = { x: 0.6, y: -0.2 };
    const positions = { wood: { x: -2, y: Number.NaN } };
    const snapshot = createAudioToneSnapshot({
      volume: 1.4,
      defaultSoundSet: "classic",
      defaultPosition,
      positions,
    });
    defaultPosition.x = 0;
    positions.wood.x = 0;

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.defaultTone.position)).toBe(true);
    expect(snapshot.defaultTone.position).toEqual({ x: 0.6, y: -0.2 });
    expect(snapshot.tones.wood.position).toEqual({ x: -1, y: 0 });
    expect(snapshot.boosted).toBe(true);
    expect(snapshot.outputGain).toBe(1);
    expect(snapshot.renderGain).toBeCloseTo(4.48);
  });

  it("uses exact neutral identity for already-safe PCM without mutation", () => {
    const source = new Float32Array([0.2, -0.4, 0.1]);
    const snapshot = createAudioToneSnapshot({
      volume: 1,
      defaultSoundSet: "classic",
    });

    expect(readAudioToneSnapshot(snapshot).active).toBe(false);
    expect(applyAudioToneSnapshot(source, snapshot)).toBe(source);
    expect(source).toEqual(new Float32Array([0.2, -0.4, 0.1]));
  });

  it("produces finite linked stereo output under the ceiling without changing input", () => {
    const left = new Float32Array([2, Number.NaN, 0.4]);
    const right = new Float32Array([1, Number.POSITIVE_INFINITY, 0.2]);
    const originalLeft = new Float32Array(left);
    const originalRight = new Float32Array(right);
    const snapshot = createAudioToneSnapshot({
      volume: 1,
      defaultSoundSet: "classic",
      defaultPosition: { x: 0.8, y: 0.4 },
    });

    const result = applyAudioToneSnapshot({ left, right }, snapshot) as {
      left: Float32Array;
      right: Float32Array;
    };
    const values = [...result.left, ...result.right];
    expect(values.every(Number.isFinite)).toBe(true);
    expect(Math.max(...values.map(Math.abs))).toBeLessThanOrEqual(AUDIO_OUTPUT_CEILING);
    expect(left).toEqual(originalLeft);
    expect(right).toEqual(originalRight);
    expect(result.left[0] / result.right[0]).toBeCloseTo(2, 4);
  });
});