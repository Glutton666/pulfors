import { createDrumLugDiscovery, createDrumLugMeasurement, lugFrequencyBand, type LugReading } from "@/lib/drum-lug-measurement";

function strike(rate: number, tones: [number, number][], { attack = 0, sustain = false } = {}) {
  return Float32Array.from({ length: Math.round(rate * (sustain ? 1.8 : 0.48)) }, (_, i) => {
    const t = i / rate;
    return tones.reduce((sum, [hz, gain]) => sum + gain * Math.sin(2 * Math.PI * hz * t), 0)
      * (sustain ? 1 : Math.exp(-6 * t))
      + (t < 0.017 ? attack * Math.sin(2 * Math.PI * 390 * t) : 0);
  });
}

function dampedStrike(rate: number, tones: [hz: number, gain: number, decay: number][], seconds = 0.5) {
  return Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => {
    const t = i / rate;
    return tones.reduce((sum, [hz, gain, decay]) => sum + gain * Math.exp(-decay * t) * Math.sin(2 * Math.PI * hz * t), 0);
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
    { kind: "measuring" }, { kind: "hit", frequency: 199.8 },
  ]);
  expect(input.tap([[200.4, 0.15]])).toEqual([
    { kind: "measuring" }, { kind: "hit", frequency: 200.4 },
  ]);
});

test("the locked band can pick a real weaker lug partial despite a louder peak outside it", () => {
  const input = run();
  input.detector.setReference(200);
  expect(input.tap([[202.4, 0.08], [310, 0.24]])).toEqual([
    { kind: "measuring" }, { kind: "hit", frequency: 202.4 },
  ]);
  expect(input.quiet()).toEqual([]);
  expect(input.tap([[195.2, 0.16]])).toEqual([
    { kind: "measuring" }, { kind: "hit", frequency: 195.2 },
  ]);
});

test.each([44100, 48000])("keeps actual weak low resonances around 100 Hz next to strong overtones at %d Hz", (rate) => {
  const discovery = createDrumLugDiscovery();
  const tones: Parameters<typeof dampedStrike>[1] = [[98, 0.009, 12], [210, 0.45, 4]];
  for (let i = 0; i < 2; i++) {
    discovery.push(new Float32Array(Math.round(rate * 0.12)), rate, 1);
    discovery.push(dampedStrike(rate, tones), rate, 1);
  }
  expect(discovery.finish()).toEqual([
    { frequency: 98, strikes: 2 },
    { frequency: 210, strikes: 2 },
  ]);

  const input = run(rate);
  input.detector.setReference(100);
  input.quiet();
  expect(input.send(dampedStrike(rate, [[102.6, 0.009, 12], [210, 0.45, 4]])).at(-1))
    .toEqual({ kind: "hit", frequency: 102.6 });
  // Do not infer an octave below the strongest peak if it isn't present.
  expect(input.tap([[210, 0.45]]).at(-1)).toEqual({ kind: "retry" });
  expect(input.tap([[95, 0.15], [113, 0.14]]).at(-1)).toEqual({ kind: "retry" });
});

test.each([44100, 48000])("detects the true low cutoff and rejects below-range leakage at %d Hz", (rate) => {
  const candidates = (tones: Parameters<typeof dampedStrike>[1]) => {
    const discovery = createDrumLugDiscovery();
    discovery.push(new Float32Array(Math.round(rate * 0.1)), rate, 1);
    discovery.push(dampedStrike(rate, tones), rate, 1);
    return discovery.finish();
  };
  expect(candidates([[25, 0.22, 6]])).toEqual([]);
  expect(candidates([[30, 0.22, 6]])).toEqual([{ frequency: 30, strikes: 1 }]);
  expect(candidates([[50, 0.04, 9], [210, 0.6, 4]])).toEqual([
    { frequency: 50, strikes: 1 }, { frequency: 210, strikes: 1 },
  ]);
});

test("keeps a short-lived low partial when release cuts the analysis window short", () => {
  const rate = 48000;
  const discovery = createDrumLugDiscovery();
  discovery.push(new Float32Array(rate / 10), rate, 1);
  discovery.push(dampedStrike(rate, [[105, 0.10, 30], [210, 0.44, 4]], 0.18), rate, 1);
  expect(discovery.finish()).toEqual(expect.arrayContaining([{ frequency: 105, strikes: 1 }]));
});

test("rejects a wrong mode, two similarly strong candidates, or a short attack without resonance", () => {
  const input = run();
  input.detector.setReference(200);
  for (const tones of [[[310, 0.35]], [[180, 0.13], [215, 0.12]], []] as [number, number][][]) {
    expect(input.tap(tones, { attack: 0.55 }).slice(-1)).toEqual([{ kind: "retry" }]);
  }
  expect(input.tap([[205, 0.17]]).slice(-1)).toEqual([{ kind: "hit", frequency: 205 }]);
});

test.each([44100, 48000])("held discovery keeps competing partials and counts distinct hits at %d Hz", (rate) => {
  const discovery = createDrumLugDiscovery();
  const tap = (tones: [number, number][], partial = false) => {
    discovery.push(new Float32Array(Math.round(rate * 0.09)), rate, 1);
    const pcm = strike(rate, tones, { attack: 0.55 });
    const limit = partial ? Math.round(rate * 0.29) : pcm.length;
    for (let i = 0; i < limit; i += 1024) discovery.push(pcm.subarray(i, Math.min(i + 1024, limit)), rate, 1);
  };
  tap([[198.4, 0.13], [312, 0.14], [376, 0.08]]);
  tap([[198.6, 0.12], [312, 0.15]]);
  tap([[198.8, 0.12], [312, 0.15]], true);
  expect(discovery.finish()).toEqual([
    { frequency: 198.6, strikes: 3 },
    { frequency: 312, strikes: 3 },
    { frequency: 376, strikes: 1 },
  ]);
});

test("one long sound is one hit, while unpitched attack and disabled detection give no candidates", () => {
  const discovery = createDrumLugDiscovery();
  const rate = 48000;
  const quiet = new Float32Array(rate / 10);
  discovery.push(quiet, rate, 1);
  discovery.push(strike(rate, [[200, 0.22]], { sustain: true }), rate, 1);
  discovery.push(quiet, rate, 1);
  discovery.push(strike(rate, [], { attack: 0.65 }), rate, 1);
  discovery.push(quiet, rate, 0);
  discovery.push(strike(rate, [[312, 0.3]]), rate, 0);
  expect(discovery.finish()).toEqual([{ frequency: 200, strikes: 1 }]);
});

test.each([44100, 48000])("counts prompt attacks on a ringing head separately at %d Hz", (rate) => {
  const discovery = createDrumLugDiscovery();
  const hits = [
    { at: 0.06, hz: 197.8 },
    { at: 0.30, hz: 200.4 },
    { at: 0.54, hz: 199.2 },
  ];
  const pcm = Float32Array.from({ length: Math.round(rate * 0.87) }, (_, i) => {
    const time = i / rate;
    return hits.reduce((sum, { at, hz }) => {
      const t = time - at;
      if (t < 0) return sum;
      // Leave a real, above-gate tail underneath the very next hit.
      return sum + (0.24 * Math.exp(-10 * t) + 0.045 * Math.exp(-2 * t)) * Math.sin(2 * Math.PI * hz * t)
        + (t < 0.01 ? 0.16 * Math.sin(2 * Math.PI * 642 * t) : 0);
    }, 0);
  });
  for (let i = 0; i < pcm.length; i += 1024) discovery.push(pcm.subarray(i, i + 1024), rate, 1);
  const candidate = discovery.finish().find(({ frequency }) => frequency > 194 && frequency < 204);
  expect(candidate?.strikes).toBe(3);
});

test("a long ring returns one result, and zero sensitivity accepts no hits", () => {
  const input = run();
  expect(input.tap([[200, 0.2]], { sustain: true })).toEqual([
    { kind: "measuring" }, { kind: "hit", frequency: 200 },
  ]);
  expect(input.send(strike(48000, [[200, 0.2]]), 0)).toEqual([{ kind: "waiting" }]);
  expect(input.send(strike(48000, [[200, 0.2]]), 0)).toEqual([]);
});

test("locked comparison stays within the supported drum range", () => {
  expect(lugFrequencyBand(200)).toEqual([160, 240]);
  expect(lugFrequencyBand(30)).toEqual([30, 36]);
  expect(lugFrequencyBand(450)).toEqual([360, 450]);
});
