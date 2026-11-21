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

async function installFakeMic(page: Page, mode: MicMode) {
  await page.addInitScript((micMode: MicMode) => {
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
  }, mode);
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

async function installLugTestInput(page: Page) {
  await page.addInitScript(() => {
    let sourceContext: AudioContext | null = null;
    let input: MediaStreamAudioDestinationNode | null = null;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        async getUserMedia() {
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
  });
}

test.describe("SignalGeneratorModal microphone lifecycle", () => {
  test.use({ viewport: VIEWPORT });

  test("lug tuning locks repeated hits, rejects unrelated tones, and keeps the general tuner unchanged", async ({ page }) => {
    await installLugTestInput(page);
    await openSignalGenerator(page);
    await page.getByTestId("signal-target-edit").click();
    const generalTarget = page.getByTestId("signal-frequency-input");
    await generalTarget.fill("442.5");
    await generalTarget.press("Enter");
    await expect(page.getByTestId("signal-target-frequency")).toHaveText(/442\.5/);
    await page.getByTestId("signal-lug-mode").click();
    await expect(page.getByTestId("signal-lug-panel")).toBeVisible();
    await page.getByTestId("signal-lug-edit-reference").click();
    const manual = page.getByTestId("signal-lug-reference-input");
    await manual.fill("499");
    await page.getByTestId("signal-lug-lock").click();
    await expect(page.getByTestId("signal-lug-invalid")).toBeVisible();
    await manual.fill("215.4");
    await manual.press("Enter");
    await expect(page.getByTestId("signal-lug-reference")).toHaveText("215.4 Hz");
    await page.getByTestId("signal-lug-unlock").click();

    await page.getByTestId("signal-lug-mic").click();
    await expect(page.getByTestId("signal-lug-status")).toHaveText(/Tap a lug|기준으로 삼을 러그/);
    const tap = (tones: LugTones) => page.evaluate((data) => {
      (window as typeof window & { strikeLug: (values: LugTones) => void }).strikeLug(data);
    }, tones);
    const measuredHz = async () => Number.parseFloat(await page.getByTestId("signal-lug-reading").innerText());
    await tap([[200, 0.22], [315, 0.025]]);
    await expect.poll(measuredHz).toBeCloseTo(200, 0);
    await expect(page.getByTestId("signal-lug-use-reading")).toBeDisabled();
    await tap([[200.3, 0.24]]);
    await expect(page.getByTestId("signal-lug-use-reading")).toBeEnabled();
    await page.getByTestId("signal-lug-use-reading").click();
    const reference = Number((await page.getByTestId("signal-lug-reference").innerText()).split(" ")[0]);
    expect(reference).toBeCloseTo(200.2, 0);
    await tap([[202.4, 0.11], [315, 0.29]]);
    await expect.poll(measuredHz).toBeCloseTo(202.4, 0);
    const reading = await measuredHz();
    await expect(page.getByTestId("signal-lug-difference")).toHaveText(`+${(reading - reference).toFixed(1)} Hz`);
    await page.waitForTimeout(500);
    expect(await measuredHz()).toBe(reading);
    await tap([[315, 0.35]]);
    await expect(page.getByTestId("signal-lug-status")).toHaveText(/Please tap again|다시 쳐 주세요/);
    await expect(page.getByTestId("signal-lug-reading")).toHaveText("—");
    await expect(page.getByTestId("signal-lug-reference")).toHaveText(`${reference.toFixed(1)} Hz`);
    await page.getByTestId("signal-lug-mode").click();
    await expect(page.getByTestId("signal-target-frequency")).toHaveText(/442\.5/);
    await expect(page.getByTestId("signal-lug-panel")).toHaveCount(0);
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