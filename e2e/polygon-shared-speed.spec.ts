import { expect, test, type Page } from "@playwright/test";

test.use({
  baseURL: process.env.SETTINGS_TEST_URL,
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  isMobile: false, hasTouch: true,
});
test.setTimeout(90000);

async function openPolygon(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
    localStorage.setItem("metronome_lab_unlocked", "true");
    localStorage.setItem("metronome_language", "en");
    localStorage.setItem("metronome_settings", JSON.stringify({ bpm: 120 }));
    (window as any).polygonAudioStarts = [];
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = original.call(this);
      const start = source.start.bind(source);
      source.start = (...args: Parameters<typeof start>) => {
        const samples = source.buffer?.getChannelData(0);
        // Count real, non-silent one-shot click output, not preparation buffers.
        if ((window as any).polygonProbe && !source.loop && samples?.some(v => Math.abs(v) > 0.005)) {
          (window as any).polygonAudioStarts.push(performance.now());
        }
        return start(...args);
      };
      return source;
    };
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60000 });
  await page.getByTestId("mode-cycle-label").click();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("menu-lab")).toBeVisible();
  await page.getByTestId("menu-lab").click();
  await page.getByTestId("menu-polygon").click();
  await expect(page.getByTestId("polygon-screen")).toBeVisible();
}

test("shared speeds scale actual non-silent browser output without changing displayed BPM", async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 874 });
  await openPolygon(page);
  const control = page.getByTestId("polygon-play-toggle");
  for (const [rate, expectedInterval] of [[2, 250], [1, 500], [0.5, 1000]]) {
    await page.getByTestId(`polygon-speed-${rate}`).click();
    await expect(page.getByTestId(`polygon-speed-${rate}`)).toHaveAttribute("aria-checked", "true");
    await page.evaluate(() => {
      (window as any).polygonAudioStarts = [];
      (window as any).polygonProbe = true;
    });
    await control.click();
    await expect(control).toContainText("Playing");
    await expect.poll(async () => page.evaluate(() =>
      ((window as any).polygonAudioStarts as number[]).length
    ), { timeout: 10000 }).toBeGreaterThanOrEqual(5);
    await control.click();
    await expect(control).toContainText("Stopped");
    const intervals = await page.evaluate(() => {
      const times = (window as any).polygonAudioStarts as number[];
      return times.slice(1).map((at, i) => at - times[i]);
    });
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    expect(Math.abs(median - expectedInterval)).toBeLessThan(90);
    await expect(page.getByTestId("polygon-screen").getByTestId("bpm-display")).toHaveText("120");
  }
  // A live edit must commit without stopping, and old-rate timers must not
  // create extra clicks after the new boundary.
  await page.getByTestId("polygon-speed-2").click();
  await control.click();
  await expect(control).toContainText("Playing");
  await page.getByTestId("polygon-speed-0.5").click();
  await page.evaluate(() => { (window as any).polygonAudioStarts = []; });
  await expect.poll(async () => page.evaluate(() =>
    ((window as any).polygonAudioStarts as number[]).length
  ), { timeout: 12000 }).toBeGreaterThanOrEqual(6);
  const liveIntervals = await page.evaluate(() => {
    const times = ((window as any).polygonAudioStarts as number[]).slice(-4);
    return times.slice(1).map((at, i) => at - times[i]);
  });
  for (const interval of liveIntervals) expect(Math.abs(interval - 1000)).toBeLessThan(90);
  await page.getByTestId("polygon-close").click();
  await expect(page.getByTestId("polygon-screen")).toHaveCount(0);
  // Existing close behavior reveals the underlying ordinary metronome. It
  // must return to its unscaled 120-BPM clock, not keep Polygon's half speed.
  await page.evaluate(() => { (window as any).polygonAudioStarts = []; });
  await expect.poll(async () => page.evaluate(() =>
    ((window as any).polygonAudioStarts as number[]).length
  ), { timeout: 6000 }).toBeGreaterThanOrEqual(5);
  const exitIntervals = await page.evaluate(() => {
    const times = ((window as any).polygonAudioStarts as number[]).slice(-4);
    return times.slice(1).map((at, i) => at - times[i]);
  });
  for (const interval of exitIntervals) expect(Math.abs(interval - 500)).toBeLessThan(90);
});

test("portrait, short landscape and tablet retain accessible controls and bounded canvas", async ({ page }) => {
  await openPolygon(page);
  await page.getByTestId("polygon-layer-add").click();
  for (const [name, width, height] of [
    ["phone", 375, 667], ["landscape", 844, 390], ["tablet", 768, 1024],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.getByTestId("polygon-speed-1")).toBeVisible();
    for (const testId of ["polygon-play-toggle", "polygon-speed-2", "polygon-speed-0.5", "polygon-layer-add"]) {
      const target = page.getByTestId(testId);
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
      await target.click({ trial: true });
    }
    // Existence/visibility alone missed the original landscape canvas collapse.
    const canvas = await page.getByTestId("polygon-canvas").boundingBox();
    expect(canvas).not.toBeNull();
    expect(canvas!.width).toBeGreaterThan(100);
    expect(canvas!.height).toBeGreaterThan(100);
    await page.screenshot({ path: `generated-artifacts/polygon-${name}.jpg` });
  }
});
