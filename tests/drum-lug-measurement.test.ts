import { createDrumLugMeasurement, lugFrequencyBand, parseLugReference, type LugReading } from "@/lib/drum-lug-measurement";

function strike(rate: number, tones: [number, number][], { attack = 0, sustain = false } = {}) {
  return Float32Array.from({ length: Math.round(rate * (sustain ? 1.8 : 0.48)) }, (_, i) => {
    const t = i / rate;
    return tones.reduce((sum, [hz, gain]) => sum + gain * Math.sin(2 * Math.PI * hz * t), 0)
      * (sustain ? 1 : Math.exp(-6 * t))
      + (t < 0.017 ? attack * Math.sin(2 * Math.PI * 390 * t) : 0);
  });
}

function run(rate = 48000) {
  const detector = createDrumLugMeasurement();
  const send = (samples: Float32Array, sensitivity = 1) => {
    const events: LugReading[] = [];
    for (let i = 0; i < samples.length; i += 1024) {
      const event = detector.push(samples.subarray(i, i + 1024), rate, sensitivity);
      if (event) events.push(event);
    }
    return events;
  };
  return {
    detector,
    quiet: () => send(new Float32Array(Math.round(rate * 0.09))),
    send,
    tap: (tones: [number, number][], options?: Parameters<typeof strike>[2]) => {
      send(new Float32Array(Math.round(rate * 0.09)));
      return send(strike(rate, tones, options));
    },
  };
}

test.each([44100, 48000])("detects the repeated ring rather than the stick attack at %d Hz", (rate) => {
  const input = run(rate);
  expect(input.tap([[199.8, 0.18], [320, 0.03]], { attack: 0.65 })).toEqual([
    { kind: "measuring" }, { kind: "hit", frequency: 199.8, suggestedReference: null },
  ]);
  expect(input.tap([[200.4, 0.15]])).toEqual([
    { kind: "measuring" }, { kind: "hit", frequency: 200.4, suggestedReference: 200.1 },
  ]);
});

test("the locked band can pick a real weaker lug partial despite a louder peak outside it", () => {
  const input = run();
  input.detector.setReference(200);
  expect(input.tap([[202.4, 0.08], [310, 0.24]])).toEqual([
    { kind: "measuring" }, { kind: "hit", frequency: 202.4, suggestedReference: null },
  ]);
  expect(input.quiet()).toEqual([]);
  expect(input.tap([[195.2, 0.16]])).toEqual([
    { kind: "measuring" }, { kind: "hit", frequency: 195.2, suggestedReference: null },
  ]);
});

test("rejects a wrong mode, two similarly strong candidates, or a short attack without resonance", () => {
  const input = run();
  input.detector.setReference(200);
  for (const tones of [[[310, 0.35]], [[180, 0.13], [215, 0.12]], []] as [number, number][][]) {
    expect(input.tap(tones, { attack: 0.55 }).slice(-1)).toEqual([{ kind: "retry" }]);
  }
  expect(input.tap([[205, 0.17]]).slice(-1)).toEqual([{ kind: "hit", frequency: 205, suggestedReference: null }]);
});

test("requires a repeat of the same initial partial and resets history on unlock", () => {
  const input = run();
  input.tap([[200, 0.2]]);
  expect(input.tap([[280, 0.2]]).slice(-1)).toEqual([{ kind: "hit", frequency: 280, suggestedReference: null }]);
  expect(input.tap([[280, 0.2]]).slice(-1)).toEqual([{ kind: "hit", frequency: 280, suggestedReference: 280 }]);
  input.detector.setReference(280);
  input.detector.setReference(null);
  expect(input.tap([[280, 0.2]]).slice(-1)).toEqual([{ kind: "hit", frequency: 280, suggestedReference: null }]);
});

test("a long ring returns one result, and zero sensitivity accepts no hits", () => {
  const input = run();
  expect(input.tap([[200, 0.2]], { sustain: true })).toEqual([
    { kind: "measuring" }, { kind: "hit", frequency: 200, suggestedReference: null },
  ]);
  expect(input.send(strike(48000, [[200, 0.2]]), 0)).toEqual([{ kind: "waiting" }]);
  expect(input.send(strike(48000, [[200, 0.2]]), 0)).toEqual([]);
});

test("manual reference is limited to the drum range at one decimal place", () => {
  expect(parseLugReference(" 200,4 ")).toBe(200.4);
  for (const text of ["", "29.9", "450.1", "200.42", "2e2", "Infinity"]) expect(parseLugReference(text)).toBeNull();
  expect(lugFrequencyBand(200)).toEqual([160, 240]);
  expect(lugFrequencyBand(30)).toEqual([30, 36]);
  expect(lugFrequencyBand(450)).toEqual([360, 450]);
});
