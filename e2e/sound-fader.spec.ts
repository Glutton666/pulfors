import { test, expect, type Frame, type Page } from "@playwright/test";

test.use({ viewport: { width: 500, height: 1000 } });

async function openSettings(page: Page, app: Frame) {
  await app.getByRole("button", { name: /^(Settings|설정)$/ }).click({ timeout: 10_000 });
  await app.getByText(/^(Sound|사운드)$/).click();
  await expect(app.getByTestId("xy-tone-pad-control")).toBeVisible();
}
async function position(app: Frame) {
  return app.getByTestId("xy-tone-pad-control").getAttribute("aria-valuetext");
}
async function drag(page: Page, app: Frame, x: number, y: number) {
  const pad = app.getByTestId("xy-tone-pad-control");
  await pad.scrollIntoViewIfNeeded();
  const rect = (await pad.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * (x + 1) / 2, rect.y + rect.height * (y + 1) / 2, { steps: 6 });
  await page.mouse.up();
}

test("iframe: independent diagonal dragging, preview PCM, per-sound persistence and reset", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("tone_test_seeded")) {
      localStorage.setItem("metronome_onboarding_done", "1");
      localStorage.setItem("metronome_settings", JSON.stringify({ soundSet: "classic", volume: 0.75 }));
      localStorage.setItem("tone_test_seeded", "1");
    }
    const captures: { length: number; energy: number; roughness: number; onset: number; peak: number; stopped: boolean }[] = [];
    (window as any).__toneCaptures = captures;
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer) {
        const pcm = this.buffer.getChannelData(0);
        let energy = 0, diff = 0, onset = 0, peak = 0;
        for (let i = 0; i < pcm.length; i++) {
          energy += pcm[i] ** 2;
          if (i < this.buffer.sampleRate * 0.002) onset += pcm[i] ** 2;
          if (i) diff += (pcm[i] - pcm[i - 1]) ** 2;
          peak = Math.max(peak, Math.abs(pcm[i]));
        }
        const capture = { length: pcm.length, energy, roughness: diff / energy, onset: onset / energy, peak, stopped: false };
        captures.push(capture);
        (this as any).__toneCapture = capture;
      }
      return original.apply(this, args as any);
    };
    const originalStop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (...args) {
      if ((this as any).__toneCapture) (this as any).__toneCapture.stopped = true;
      return originalStop.apply(this, args as any);
    };
  });
  await page.route("**/tone-test-host", route => route.fulfill({
    contentType: "text/html",
    body: '<body style="margin:0"><iframe id="app" src="/" allow="autoplay; microphone" style="border:0;width:500px;height:1000px"></iframe></body>',
  }));
  await page.goto("/tone-test-host", { waitUntil: "domcontentloaded" });
  await page.locator("#app").contentFrame().locator("body").waitFor();
  const frame = page.frames().find(frame => frame.parentFrame())!;
  await expect(frame.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60_000 });
  for (let i = 0; i < 8; i++) {
    const skip = frame.getByText(/건너뛰기|Skip/i).first();
    if (!await skip.isVisible()) break;
    await skip.click();
  }
  await openSettings(page, frame);
  for (const [x, y] of [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9], [0, 0]]) {
    await drag(page, frame, x, y);
    expect(await position(frame)).toBe(`x ${x.toFixed(2)}, y ${y.toFixed(2)}`);
  }
  await drag(page, frame, -0.9, -0.9);
  await expect.poll(() => frame.evaluate(() => JSON.parse(localStorage.getItem("metronome_settings")!).soundSetTonePositions?.classic))
    .toEqual({ x: -0.9, y: -0.9 });
  // Preview cycles strong/accent/normal; compare the same strong role before
  // and after reset. Inspect normalized acoustic features, not volume alone.
  const classic = frame.getByText(/^(Classic|클래식)$/);
  const count = () => frame.evaluate(() => (window as any).__toneCaptures.length);
  let previous = await count();
  await classic.click();
  await expect.poll(count).toBeGreaterThan(previous);
  const diagonal = await frame.evaluate(() => (window as any).__toneCaptures.at(-1));
  await frame.getByTestId("xy-tone-pad-reset").click();
  for (let i = 0; i < 3; i++) {
    previous = await count();
    await classic.click();
    await expect.poll(count).toBeGreaterThan(previous);
  }
  const neutral = await frame.evaluate(() => (window as any).__toneCaptures.at(-1));
  expect(diagonal.peak).toBeLessThanOrEqual(0.98);
  expect(neutral.peak).toBeLessThanOrEqual(0.98);
  expect(Number.isFinite(diagonal.roughness)).toBe(true);
  expect(diagonal.onset).toBeGreaterThan(neutral.onset);
  expect(diagonal.roughness).toBeGreaterThan(neutral.roughness);
  await drag(page, frame, 0.6, -0.7);
  await frame.getByText(/^(Woodblock|우드블럭)$/).click();
  expect(await position(frame)).toBe("x 0.00, y 0.00");
  await frame.getByText(/^(Classic|클래식)$/).click();
  expect(await position(frame)).toBe("x 0.60, y -0.70");
  await frame.getByTestId("xy-tone-pad-control").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/tone-fader-iframe.jpg" });
  await frame.getByTestId("settings-close").click();
  await openSettings(page, frame);
  expect(await position(frame)).toBe("x 0.60, y -0.70");
  await frame.getByTestId("xy-tone-pad-reset").click();
  expect(await position(frame)).toBe("x 0.00, y 0.00");
  await drag(page, frame, 0.6, -0.7);
  await expect.poll(() => frame.evaluate(() => JSON.parse(localStorage.getItem("metronome_settings")!).soundSetTonePositions?.classic))
    .toEqual({ x: 0.6, y: -0.7 });
  await frame.goto("/", { waitUntil: "domcontentloaded" });
  await openSettings(page, frame);
  expect(await position(frame)).toBe("x 0.60, y -0.70");
  const pad = frame.getByTestId("xy-tone-pad-control");
  await pad.dblclick({ position: { x: 30, y: 30 } });
  expect(await position(frame)).toBe("x 0.00, y 0.00");
  await drag(page, frame, -0.9, -0.9);
  await frame.getByTestId("settings-close").click();
  const toggle = frame.getByRole("button", { name: /Play or pause|재생.*정지/ });
  await expect(toggle).toBeVisible();
  previous = await count();
  await toggle.click();
  await expect.poll(count).toBeGreaterThan(previous);
  const playing = await frame.evaluate(() => (window as any).__toneCaptures.at(-1));
  expect(playing.length).toBeGreaterThan(44_100);
  expect(playing.energy).toBeGreaterThan(0);
  expect(playing.peak).toBeLessThanOrEqual(0.98);
  await toggle.click();
  await expect.poll(() => frame.evaluate(() => (window as any).__toneCaptures.at(-1).stopped)).toBe(true);
  expect(errors).toEqual([]);
});
