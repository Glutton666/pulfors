import { test, expect, type Page } from "@playwright/test";

test.use({
  baseURL: process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : undefined,
});

const VIEWPORT = { width: 375, height: 667 };

type MicMode = "tone" | "silence" | "denied";

type MicProbe = {
  inputMode: MicMode;
  contextsCreated: number;
  contextsClosed: number;
  streamsCreated: number;
  trackStops: number;
  sourcesDisconnected: number;
};

async function installFakeMic(page: Page, mode: MicMode, permissionDelayMs = 0) {
  await page.addInitScript(({ micMode, permissionDelayMs }) => {
    const probe: MicProbe = {
      inputMode: micMode,
      contextsCreated: 0,
      contextsClosed: 0,
      streamsCreated: 0,
      trackStops: 0,
      sourcesDisconnected: 0,
    };
    (window as Window & { __signalMicProbe?: MicProbe }).__signalMicProbe = probe;

    const targetFreq = 330;
    class FakeAnalyser {
      fftSize = 8192;
      smoothingTimeConstant = 0;

      get frequencyBinCount() {
        return this.fftSize / 2;
      }

      getFloatTimeDomainData(buffer: Float32Array) {
        for (let i = 0; i < buffer.length; i++) {
          buffer[i] = probe.inputMode === "tone"
            ? Math.sin(2 * Math.PI * targetFreq * i / 48000) * 0.25
            : 0;
        }
      }

      getFloatFrequencyData(buffer: Float32Array) {
        buffer.fill(-100);
        if (probe.inputMode !== "tone") return;
        const bin = Math.round(targetFreq / (48000 / this.fftSize));
        buffer[bin - 1] = -20;
        buffer[bin] = -10;
        buffer[bin + 1] = -20;
      }
    }

    class FakeAudioContext {
      sampleRate = 48000;
      state = "running";

      constructor() {
        probe.contextsCreated += 1;
      }

      createAnalyser() {
        return new FakeAnalyser();
      }

      createMediaStreamSource() {
        return {
          connect() {},
          disconnect() {
            probe.sourcesDisconnected += 1;
          },
        };
      }

      async resume() {}

      async close() {
        this.state = "closed";
        probe.contextsClosed += 1;
      }
    }

    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: FakeAudioContext,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      configurable: true,
      value: FakeAudioContext,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          if (permissionDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, permissionDelayMs));
          if (micMode === "denied") {
            throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
          }
          probe.streamsCreated += 1;
          return {
            getTracks: () => [{
              stop() {
                probe.trackStops += 1;
              },
            }],
          };
        },
      },
    });
  }, { micMode: mode, permissionDelayMs });
}

async function openSignalGenerator(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("mode-cycle-label").click();
  const dial = page.getByTestId("mode-dial-touch-frame");
  await expect(dial).toBeVisible();
  for (let step = 0; step < 5 && !/^(Menu|메뉴)$/.test(await dial.getAttribute("aria-valuetext") ?? ""); step += 1) {
    await page.keyboard.press("ArrowLeft");
  }
  await expect(dial).toHaveAttribute("aria-valuetext", /^(Menu|메뉴)$/);
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", {
    name: /signal generator|시그널 제너레이터/i,
  }).click();
  await page.locator('[data-testid="signal-mic-toggle"]').waitFor({
    state: "visible",
    timeout: 10000,
  });
}

async function getProbe(page: Page): Promise<MicProbe> {
  return page.evaluate(() => {
    const probe = (window as Window & { __signalMicProbe?: MicProbe }).__signalMicProbe;
    if (!probe) throw new Error("microphone probe was not installed");
    return { ...probe };
  });
}

type LugTones = [hz: number, amplitude: number][];

async function installLugTestInput(page: Page, options: { permissionDelayMs?: number; noWorklet?: boolean } = {}) {
  await page.addInitScript(({ permissionDelayMs, noWorklet }) => {
    let sourceContext: AudioContext | null = null;
    let input: MediaStreamAudioDestinationNode | null = null;
    if (noWorklet) Object.defineProperty(window, "AudioWorkletNode", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        async getUserMedia() {
          if (permissionDelayMs) await new Promise((resolve) => setTimeout(resolve, permissionDelayMs));
          if (sourceContext) await sourceContext.close();
          sourceContext = new AudioContext({ sampleRate: 48000 });
          await sourceContext.resume();
          input = sourceContext.createMediaStreamDestination();
          return input.stream;
        },
      },
    });
    (window as typeof window & { strikeLug: (tones: LugTones) => void }).strikeLug = (tones) => {
      if (!sourceContext || !input) throw new Error("Microphone did not start");
      const context = sourceContext;
      const buffer = context.createBuffer(1, Math.round(context.sampleRate * 0.5), context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        const t = i / context.sampleRate;
        samples[i] = tones.reduce((sum, [hz, gain]) => sum + gain * Math.sin(2 * Math.PI * hz * t), 0) * Math.exp(-6 * t);
      }
      const strike = context.createBufferSource();
      strike.buffer = buffer;
      strike.connect(input);
      strike.start(context.currentTime + 0.12);
    };
  }, options);
}

test.describe("SignalGeneratorModal microphone lifecycle", () => {
  test.use({ viewport: VIEWPORT });

  test("held analysis can choose a weak low partial and compare it in the same tuner", async ({ page }) => {
    await installLugTestInput(page);
    await openSignalGenerator(page);
    await page.getByTestId("signal-target-edit").click();
    const generalTarget = page.getByTestId("signal-frequency-input");
    await generalTarget.fill("442.5");
    await generalTarget.press("Enter");
    await expect(page.getByTestId("signal-target-frequency")).toHaveText(/442\.5/);
    const tap = (tones: LugTones) => page.evaluate((data) => {
      (window as typeof window & { strikeLug: (values: LugTones) => void }).strikeLug(data);
    }, tones);
    const mic = page.getByTestId("signal-mic-toggle");
    await mic.scrollIntoViewIfNeeded();
    const box = (await mic.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByTestId("signal-tuner-panel").getByText(/^(Listening|감지 중)$/)).toBeVisible();
    await tap([[100, 0.009], [315, 0.38], [372, 0.09]]);
    await page.waitForTimeout(760);
    await tap([[100.2, 0.009], [315, 0.38]]);
    await page.waitForTimeout(760);
    await page.mouse.up();
    await expect(page.getByTestId("signal-analysis-timeline")).toBeVisible();
    await expect(page.getByTestId("signal-lug-comparison")).toHaveCount(0);
    const candidates = page.getByTestId("signal-lug-candidates");
    await expect(candidates.getByTestId("signal-lug-candidate-0")).toHaveText(/100\.\d Hz · G2\s*(?:2 hits|2번 감지)/);
    await expect(candidates.getByTestId("signal-lug-candidate-1")).toHaveText(/315\.\d Hz · D#4\s*(?:2 hits|2번 감지)/);
    const oneHit = candidates.getByTestId("signal-lug-candidate-2");
    await expect(oneHit).toHaveText(/372\.\d Hz · F#4\s*(?:1 hit|1번 감지)/);
    const confirm = candidates.getByTestId("signal-lug-lock-candidate");
    await expect(confirm).toBeDisabled();
    await oneHit.click();
    await confirm.click();
    await expect(page.getByTestId("signal-lug-reference-note")).toHaveText("F#4");
    await candidates.getByTestId("signal-lug-candidate-0").click();
    await confirm.click();
    await expect(page.getByTestId("signal-lug-status")).toHaveText(/Tap each lug|비교할 러그/);
    const reference = Number.parseFloat(await page.getByTestId("signal-lug-reference").innerText());
    expect(reference).toBeCloseTo(100.1, 0);
    await expect(page.getByTestId("signal-lug-reference-note")).toHaveText("G2");
    await expect(page.getByTestId("signal-target-frequency")).toHaveText(/442\.5/);
    const measuredHz = async () => Number.parseFloat(await page.getByTestId("signal-lug-reading").innerText());
    await tap([[102.4, 0.011], [315, 0.29]]);
    await expect.poll(measuredHz).toBeCloseTo(102.4, 0);
    await expect(page.getByTestId("signal-lug-reading-note")).toHaveText("G#2");
    const reading = await measuredHz();
    await expect(page.getByTestId("signal-lug-difference")).toHaveText(`+${(reading - reference).toFixed(1)} Hz`);
    await page.waitForTimeout(500);
    expect(await measuredHz()).toBe(reading);
    await tap([[315, 0.35]]);
    await expect(page.getByTestId("signal-lug-status")).toHaveText(/Please tap again|다시 쳐 주세요/);
    await expect(page.getByTestId("signal-lug-reading")).toHaveText("—");
    await expect(page.getByTestId("signal-lug-reference")).toHaveText(`${reference.toFixed(1)} Hz`);
    await page.getByRole("button", { name: /Close analysis mode|감지 모드 닫기/ }).click();
    await expect(page.getByTestId("signal-lug-reference")).toHaveText(`${reference.toFixed(1)} Hz`);
    await expect(page.getByTestId("signal-lug-status")).toHaveText(/Please tap again|다시 쳐 주세요/);
    await page.getByTestId("signal-lug-unlock").click();
    await expect(page.getByTestId("signal-target-frequency")).toHaveText(/442\.5/);
    await expect(page.getByTestId("signal-lug-comparison")).toHaveCount(0);
    await expect(page.getByTestId("signal-tuner-cents")).toBeVisible();
  });

  test("detects a tone, releases resources, and can restart cleanly", async ({ page }) => {
    await installFakeMic(page, "tone");
    await openSignalGenerator(page);

    const mic = page.locator('[data-testid="signal-mic-toggle"]');
    const beforeStart = await getProbe(page);
    await mic.click();
    await expect(page.getByTestId("signal-mic-frequency")).toHaveText("328.1", { timeout: 5000 });
    await expect(page.getByTestId("signal-mic-note")).toHaveText("E4");
    await expect(page.getByTestId("signal-tuner-cents")).toHaveText(/^-/);
    await page.getByTestId("signal-use-detected").click();
    await expect(page.getByTestId("signal-target-frequency")).toHaveText(/328\.1/);
    await expect(page.getByTestId("signal-tuner-cents")).toHaveText("0¢");
    await page.evaluate(() => {
      (window as Window & { __signalMicProbe: MicProbe }).__signalMicProbe.inputMode = "silence";
    });
    await expect(page.getByTestId("signal-mic-frequency")).toHaveCount(0, { timeout: 5000 });
    await expect(page.getByTestId("signal-tuner-cents")).toHaveText("—");
    await page.evaluate(() => {
      (window as Window & { __signalMicProbe: MicProbe }).__signalMicProbe.inputMode = "tone";
    });
    await expect(page.getByTestId("signal-mic-frequency")).toHaveText("328.1", { timeout: 5000 });

    const started = await getProbe(page);
    expect(started.contextsCreated).toBe(beforeStart.contextsCreated + 1);
    expect(started.contextsClosed).toBe(beforeStart.contextsClosed);
    expect(started.streamsCreated).toBe(beforeStart.streamsCreated + 1);

    await mic.click();
    await page.waitForTimeout(500);
    const stopped = await getProbe(page);
    expect(stopped.contextsClosed).toBe(beforeStart.contextsClosed + 1);
    expect(stopped.trackStops).toBe(beforeStart.trackStops + 1);
    expect(stopped.sourcesDisconnected).toBe(beforeStart.sourcesDisconnected + 1);
    await expect(page.getByTestId("signal-mic-frequency")).toHaveCount(0);
    await expect(page.getByTestId("signal-tuner-cents")).toHaveText("—");

    await mic.click();
    await expect.poll(async () => (await getProbe(page)).contextsCreated, {
      timeout: 5000,
    }).toBe(beforeStart.contextsCreated + 2);
    await expect.poll(async () => (await getProbe(page)).streamsCreated, {
      timeout: 5000,
    }).toBe(beforeStart.streamsCreated + 2);
    await expect(page.getByTestId("signal-mic-frequency")).toHaveText("328.1", { timeout: 5000 });
    const restarted = await getProbe(page);
    expect(restarted.contextsCreated).toBe(beforeStart.contextsCreated + 2);
    expect(restarted.streamsCreated).toBe(beforeStart.streamsCreated + 2);
    await page.screenshot({ path: "/tmp/signal-mic-web-regression.png" });
    for (const viewport of [
      { width: 667, height: 375 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      await page.getByTestId("signal-scroll").evaluate((node) => { node.scrollTop = 0; });
      await expect(page.getByTestId("signal-mic-frequency")).toBeInViewport();
      await expect(page.getByTestId("signal-target-frequency")).toBeInViewport();
      await expect(page.getByTestId("signal-mic-toggle")).toBeInViewport();
      const bounds = await page.getByTestId("signal-tuner-panel").boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({ path: `/tmp/signal-tuner-${viewport.width}x${viewport.height}.png` });
    }
  });

  test("holds past ten seconds and shows analysis below the tuner on release", async ({ page }) => {
    test.setTimeout(60_000);
    await installFakeMic(page, "tone");
    await openSignalGenerator(page);
    const mic = page.getByTestId("signal-mic-toggle");
    await mic.scrollIntoViewIfNeeded();
    const box = (await mic.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByTestId("signal-analysis-status")).toHaveText(/Analyzing|Listening|소리를 듣고/);
    await page.waitForTimeout(10_500);
    await expect(page.getByTestId("signal-analysis-timeline")).toHaveCount(0);
    await expect(page.getByTestId("signal-analysis-status")).toHaveText(/1[01]\.\ds/);
    await page.mouse.up();
    await expect(page.getByTestId("signal-analysis-timeline")).toBeVisible();
    await expect(page.getByTestId("signal-tuner-panel")).toBeVisible();
    await expect(mic).toHaveAttribute("aria-label", /Start mic|마이크 켜기/i);
    await expect(page.getByTestId("signal-analysis-panel")).toContainText(/G#4|A4|E4/);
    const probe = await getProbe(page);
    expect(probe.trackStops).toBe(probe.streamsCreated);
  });

  test("permission focus changes and an unavailable worklet do not hide the held result", async ({ page }) => {
    await installLugTestInput(page, { permissionDelayMs: 1300, noWorklet: true });
    await openSignalGenerator(page);
    const mic = page.getByTestId("signal-mic-toggle");
    await mic.scrollIntoViewIfNeeded();
    const box = (await mic.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByTestId("signal-analysis-status")).toHaveText(/Connecting microphone|마이크 연결 중/);
    // Browser permission popups can take focus while the same page is visible.
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(page.getByTestId("signal-analysis-status")).toHaveText(/Listening|소리를 듣고/);
    expect(await mic.evaluate((node) => !node.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })))).toBe(true);
    await page.evaluate(() => {
      (window as typeof window & { strikeLug: (values: LugTones) => void }).strikeLug([[100, 0.16]]);
    });
    await page.waitForTimeout(550);
    await page.mouse.up();
    const result = page.getByTestId("signal-lug-candidates");
    await expect(result).toBeInViewport();
    await expect(result.getByTestId("signal-lug-candidate-0")).toHaveText(/100\.0 Hz · G2/);
    await result.getByTestId("signal-lug-candidate-0").click();
    await result.getByTestId("signal-lug-lock-candidate").click();
    await expect(page.getByTestId("signal-lug-status")).toHaveText(/Tap each lug|비교할 러그/);
  });

  test("release during connection shows an explanation and stops the late microphone", async ({ page }) => {
    await installFakeMic(page, "tone", 1300);
    await openSignalGenerator(page);
    const mic = page.getByTestId("signal-mic-toggle");
    await mic.scrollIntoViewIfNeeded();
    const box = (await mic.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByTestId("signal-analysis-status")).toHaveText(/Connecting microphone|마이크 연결 중/);
    await page.mouse.up();
    await expect(page.getByTestId("signal-analysis-panel")).toContainText(/released before the mic connected|마이크가 연결되기 전에/);
    await expect.poll(async () => (await getProbe(page)).trackStops).toBe(1);
  });

  test("shows no signal for a live but silent input", async ({ page }) => {
    await installFakeMic(page, "silence");
    await openSignalGenerator(page);

    await page.locator('[data-testid="signal-mic-toggle"]').click();
    await expect(page.getByText(/신호 없음|No signal/)).toBeVisible({ timeout: 5000 });
  });

  test("shows a permission message when microphone access is denied", async ({ page }) => {
    await installFakeMic(page, "denied");
    await openSignalGenerator(page);

    await page.locator('[data-testid="signal-mic-toggle"]').click();
    await expect(page.getByText(/마이크 권한이 필요합니다|Microphone permission is required/))
      .toBeVisible({ timeout: 5000 });
  });
});