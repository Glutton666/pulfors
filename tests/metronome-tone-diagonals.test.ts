import {
  limitLinkedPCM, mapTonePositionToWeights, processClickPCM, toneEffectIntensity,
} from "@/lib/metronome-tone-dsp";

const SR = 44_100;
const click = Float32Array.from({ length: 529 }, (_, i) => {
  const t = i / SR;
  return (0.0042 * Math.sin(2 * Math.PI * 500 * t)
    + 0.0016 * Math.sin(2 * Math.PI * 7000 * t)) * Math.exp(-t / 0.006);
});
const process = (x: number, y: number, source: Float32Array = click) =>
  processClickPCM(source, { x, y }, SR) as Float32Array;
const energy = (pcm: Float32Array, start = 0, end = pcm.length) =>
  pcm.subarray(start, end).reduce((sum, value) => sum + value ** 2, 0);
const roughness = (pcm: Float32Array) => {
  let sum = 0;
  for (let i = 1; i < pcm.length; i++) sum += (pcm[i] - pcm[i - 1]) ** 2;
  return sum / energy(pcm);
};

test("sweeping either axis never dilutes the other effect's control strength", () => {
  for (const fixed of [-1, -0.7, -0.1, 0, 0.1, 0.7, 1]) {
    for (let step = -20; step <= 20; step++) {
      const moving = step / 20;
      const horizontal = mapTonePositionToWeights({ x: fixed, y: moving });
      const vertical = mapTonePositionToWeights({ x: moving, y: fixed });
      expect(horizontal.attack).toBe(mapTonePositionToWeights({ x: fixed, y: 0 }).attack);
      expect(horizontal.resonance).toBe(mapTonePositionToWeights({ x: fixed, y: 0 }).resonance);
      expect(vertical.high).toBe(mapTonePositionToWeights({ x: 0, y: fixed }).high);
      expect(vertical.low).toBe(mapTonePositionToWeights({ x: 0, y: fixed }).low);
    }
  }
});

test.each([[-1, -1], [-1, 1], [1, -1], [1, 1], [-0.7, -0.4], [0.3, 0.8]])(
  "diagonal %s/%s composes both independently controlled stages, rather than a louder blend",
  (x, y) => {
    // Quiet source avoids limiter interaction; the reference runs cardinal
    // processors in series. Extra reference tail is excluded, not scheduled.
    const horizontal = process(x, 0);
    const serialReference = process(0, y, horizontal);
    const combined = process(x, y);
    expect(combined.length).toBe(click.length + Math.round(SR * 0.075));
    for (let i = 0; i < combined.length; i++) {
      expect(Math.abs(combined[i] - serialReference[i])).toBeLessThan(1e-7);
    }
    expect(combined).not.toEqual(horizontal);
    expect(combined).not.toEqual(process(0, y));
  },
);

test("all four diagonals retain temporal AND spectral signatures after level normalization", () => {
  const onset = Math.round(SR * 0.002);
  for (const y of [-1, 1]) {
    const attack = process(-1, y);
    const resonance = process(1, y);
    expect(energy(attack, 0, onset) / energy(attack)).toBeGreaterThan(
      energy(process(0, y), 0, onset) / energy(process(0, y)),
    );
    expect(energy(resonance, click.length) / energy(resonance)).toBeGreaterThan(0.005);
  }
  for (const x of [-1, 1]) {
    expect(roughness(process(x, -1))).toBeGreaterThan(roughness(process(x, 1)) * 2);
  }
});

/** Frozen pre-fix cardinal formula: keeps these sounds stable even at partial strength. */
function legacyCardinal(x: number, y: number, sampleRate: number) {
  const out = new Float32Array(click.length + Math.round(sampleRate * 0.075));
  const alpha = Math.exp(-2 * Math.PI * 1800 / sampleRate);
  const radius = 0.9985;
  const feedback = 2 * radius * Math.cos(2 * Math.PI * Math.min(1500, sampleRate * 0.18) / sampleRate);
  const intensity = toneEffectIntensity({ x, y });
  let low = 0, r1 = 0, r2 = 0;
  for (let i = 0; i < out.length; i++) {
    const input = click[i] ?? 0;
    low = (1 - alpha) * input + alpha * low;
    const high = input - low;
    const r = feedback * r1 - radius * radius * r2 + 0.025 * input;
    r2 = r1;
    r1 = r;
    const shaped = x < 0 ? input * (0.12 + 3.4 * Math.exp(-i / (sampleRate * 0.0018)))
      : x > 0 ? 0.35 * input + 8 * r
        : y < 0 ? 3 * high + 0.08 * low : 2.4 * low + 0.08 * high;
    out[i] = input + intensity * (shaped - input);
  }
  return limitLinkedPCM(out) as Float32Array;
}

test("cardinal PCM remains sample-identical to the previous voicing at partial and full strength", () => {
  for (const rate of [22_050, SR, 48_000]) {
    for (const strength of [0.1, 0.35, 0.7, 1]) {
      for (const [x, y] of [[-strength, 0], [strength, 0], [0, -strength], [0, strength]]) {
        expect(processClickPCM(click, { x, y }, rate)).toEqual(legacyCardinal(x, y, rate));
      }
    }
  }
});

test("second-axis dead zone and centre crossing are continuous, with exact neutral bypass", () => {
  expect(process(0.04, -0.03)).toBe(click);
  for (const x of [-0.8, 0.8]) {
    expect(process(x, 0.04)).toEqual(process(x, 0));
    const below = process(x, 0.049);
    const above = process(x, 0.051);
    expect(Math.max(...above.map((v, i) => Math.abs(v - below[i])))).toBeLessThan(1e-6);
  }
  expect(process(0, 0)).toBe(click);
});

test.each([[-1, -1], [-1, 1], [1, -1], [1, 1]])(
  "diagonal %s/%s preserves stereo ratios, finite samples, and the existing ceiling",
  (x, y) => {
    const left = Float32Array.from(click, v => v * 500);
    const right = Float32Array.from(left, v => v / 2);
    const result = processClickPCM({ left, right }, { x, y }) as { left: Float32Array; right: Float32Array };
    for (let i = 0; i < result.left.length; i++) {
      expect(Number.isFinite(result.left[i])).toBe(true);
      expect(Math.abs(result.left[i])).toBeLessThanOrEqual(0.98);
      expect(Math.abs(result.right[i] * 2 - result.left[i])).toBeLessThan(1e-6);
    }
  },
);
