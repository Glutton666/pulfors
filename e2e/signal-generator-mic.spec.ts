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

async function skipOnboarding(page: Page) {
  for (let i = 0; i < 8; i++) {
    const skip = page.getByText(/건너뛰기|skip/i);
    if (await skip.count() === 0) break;
    await skip.first().click();
    await page.waitForTimeout(300);
  }
}

async function openSignalGenerator(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="mode-cycle-label"]').waitFor({
    state: "visible",
    timeout: 20000,
  });
  await skipOnboarding(page);

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("viewportSize() is unavailable");
  await page.locator('[data-testid="mode-cycle-label"]').click();
  await page.waitForTimeout(400);
  await page.mouse.click(viewport.width / 2 - 58, 86);
  await page.waitForTimeout(300);
  await page.mouse.click(viewport.width / 2, viewport.height * 0.7);
  await page.waitForTimeout(600);
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

test.describe("SignalGeneratorModal microphone lifecycle", () => {
  test.use({ viewport: VIEWPORT });

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