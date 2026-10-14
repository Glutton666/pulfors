import { test, expect, type Frame } from "@playwright/test";

test.use({ viewport: { width: 420, height: 860 } });
test("iframe: long-press links one click without selecting base; count choice, replacement, removal and reload", async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem("sound_extras_seed")) {
      localStorage.setItem("metronome_onboarding_done", "1");
      localStorage.setItem("metronome_lab_unlocked", "true");
      localStorage.setItem("metronome_settings", JSON.stringify({ soundSet: "classic", volume: 0.75 }));
      localStorage.setItem("sound_extras_seed", "1");
    }
    const captures: any[] = [];
    (window as any).__soundCaptures = captures;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer) {
        const pcm = this.buffer.getChannelData(0);
        const record = { length: pcm.length, duration: this.buffer.duration, loop: this.loop,
          energy: pcm.reduce((sum, value) => sum + value * value, 0), peak: 0, stopped: false };
        for (const sample of pcm) record.peak = Math.max(record.peak, Math.abs(sample));
        captures.push(record);
        (this as any).__capture = record;
      }
      return start.apply(this, args as any);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (...args) {
      if ((this as any).__capture) (this as any).__capture.stopped = true;
      return stop.apply(this, args as any);
    };
  });
  await page.route("**/extras-test-host", route => route.fulfill({
    contentType: "text/html",
    body: '<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><iframe id="app" src="/" allow="autoplay; microphone" style="border:0;width:420px;height:860px"></iframe></body>',
  }));
  const open = async (): Promise<Frame> => {
    await page.goto("/extras-test-host", { waitUntil: "domcontentloaded" });
    const frame = page.frames().find(f => f.parentFrame())!;
    await expect(frame.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60_000 });
    for (let i = 0; i < 8; i++) {
      const skip = frame.getByText(/건너뛰기|Skip/i).first();
      if (!await skip.isVisible()) break;
      await skip.click();
    }
    await frame.getByRole("button", { name: /^(Settings|설정)$/ }).click();
    await frame.getByText(/^(Sound|사운드)$/).click();
    return frame;
  };
  let app = await open();
  const settings = () => app.evaluate(() => JSON.parse(localStorage.getItem("metronome_settings")!));
  const captureCount = () => app.evaluate(() => (window as any).__soundCaptures.length);
  for (const set of ["classic", "woodblock", "cowbell", "digital", "jamblock",
    "sine", "blip", "clave", "cajon", "marimba", "stick", "tempo"]) {
    await expect(app.getByTestId(`sound-overlay-open-${set}`)).toBeEnabled();
    await app.getByTestId(`sound-set-row-${set}`).click();
    await expect.poll(async () => (await settings()).soundSet).toBe(set);
  }
  await app.getByTestId("sound-set-row-classic").click();
  await expect.poll(async () => (await settings()).soundSet).toBe("classic");
  const row = app.getByTestId("sound-set-row-woodblock");
  await row.scrollIntoViewIfNeeded();
  const before = await captureCount();
  const rect = (await row.boundingBox())!;
  await page.mouse.move(rect.x + 25, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await expect(app.getByTestId("sound-overlay-none")).toBeVisible();
  await page.screenshot({ path: "test-results/sound-extras-picker.jpg" });
  expect(await captureCount()).toBe(before); // Release must not preview/select.
  await expect(app.getByTestId("sound-overlay-option-woodblock")).toHaveCount(0);
  await app.getByTestId("sound-overlay-option-tempo").click();
  await expect.poll(async () => (await settings()).soundSetOverlays?.woodblock).toBe("tempo");
  expect((await settings()).soundSet).toBe("classic");
  await app.getByTestId("sound-overlay-preview-woodblock").click();
  await expect.poll(captureCount).toBeGreaterThan(before);
  const preview = await app.evaluate(() => (window as any).__soundCaptures.at(-1));
  expect(preview.energy).toBeGreaterThan(0);
  expect(preview.peak).toBeLessThanOrEqual(0.98);
  await app.getByTestId("sound-overlay-open-woodblock").click();
  await app.getByTestId("sound-overlay-option-digital").click();
  await expect.poll(async () => (await settings()).soundSetOverlays?.woodblock).toBe("digital");
  await app.getByTestId("sound-overlay-open-woodblock").click();
  await app.getByTestId("sound-overlay-none").click();
  await expect.poll(async () => (await settings()).soundSetOverlays?.woodblock).toBeUndefined();
  await app.getByTestId("sound-set-row-tempo").click();
  await app.getByTestId("sound-overlay-open-tempo").click();
  await app.getByTestId("sound-overlay-option-classic").click();
  await app.getByTestId("voice-count-language-ko").click();
  await expect.poll(async () => (await settings()).voiceCountLanguage).toBe("ko");
  const voiceTop = (await app.getByTestId("voice-count-language-ko").boundingBox())!.y;
  expect(voiceTop).toBeLessThan((await app.getByTestId("sound-set-row-classic").boundingBox())!.y);
  await app.getByTestId("voice-count-output-voice-only").click();
  await app.getByTestId("voice-count-speaker-male").click();
  await expect.poll(async () => (await settings()).voiceCountOutput).toBe("voice-only");
  await expect.poll(async () => (await settings()).voiceCountSpeaker).toBe("male");
  await app.getByTestId("voice-count-language-en").click();
  await expect.poll(async () => (await settings()).voiceCountLanguage).toBe("en");
  app = await open();
  expect((await settings()).soundSetOverlays).toEqual({ tempo: "classic" });
  expect((await settings()).voiceCountLanguage).toBe("en");
  expect((await settings()).voiceCountOutput).toBe("voice-only");
  expect((await settings()).voiceCountSpeaker).toBe("male");
  await expect(app.getByTestId("voice-count-output-voice-only")).toHaveAttribute("aria-pressed", "true");
  await expect(app.getByTestId("voice-count-speaker-male")).toHaveAttribute("aria-pressed", "true");
  await expect(app.getByTestId("sound-set-row-tempo")).toHaveAttribute("aria-pressed", "true");
  await expect(app.getByTestId("voice-count-language-en")).toHaveAttribute("aria-pressed", "true");
  await app.getByTestId("voice-count-speaker-male").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/sound-extras-settings.jpg" });
  // Verify real speech assets decode and enter a single bounded output loop.
  await app.getByTestId("settings-close").click();
  const start = app.getByRole("button", { name: /Play or pause|재생.*정지/ });
  await start.click();
  await expect.poll(() => app.evaluate(() => (window as any).__soundCaptures.filter((c: any) => c.loop && !c.stopped).length)).toBe(1);
  const loop = await app.evaluate(() => (window as any).__soundCaptures.findLast((c: any) => c.loop));
  expect(loop.energy).toBeGreaterThan(0);
  expect(loop.peak).toBeLessThanOrEqual(0.98);
  await start.click();
  await expect.poll(() => app.evaluate(() => (window as any).__soundCaptures.filter((c: any) => c.loop && !c.stopped).length)).toBe(0);
  for (const language of ["ko", "en"]) {
    for (const speaker of ["male", "female"]) {
      await app.getByRole("button", { name: /^(Settings|설정)$/ }).click();
      await app.getByText(/^(Sound|사운드)$/).click();
      await app.getByTestId(`voice-count-language-${language}`).click();
      await app.getByTestId(`voice-count-speaker-${speaker}`).click();
      await app.getByTestId("voice-count-output-voice-only").click();
      await expect.poll(async () => (await settings()).voiceCountSpeaker).toBe(speaker);
      await app.getByTestId("settings-close").click();
      await start.click();
      await expect.poll(() => app.evaluate(() => (window as any).__soundCaptures.filter((c: any) => c.loop && !c.stopped).length)).toBe(1);
      const voice = await app.evaluate(() => (window as any).__soundCaptures.findLast((c: any) => c.loop));
      expect(voice.energy).toBeGreaterThan(0);
      expect(voice.peak).toBeLessThanOrEqual(0.98);
      await start.click();
      await expect.poll(() => app.evaluate(() => (window as any).__soundCaptures.filter((c: any) => c.loop && !c.stopped).length)).toBe(0);
    }
  }
  await app.getByRole("button", { name: /^(Settings|설정)$/ }).click();
  await app.getByText(/^(Sound|사운드)$/).click();
  await app.getByTestId("voice-count-language-off").click();
  await expect(app.getByTestId("voice-count-speaker-male")).toBeDisabled();
  await expect(app.getByTestId("voice-count-output-mixed")).toBeDisabled();
  await app.getByTestId("settings-close").click();
  await start.click();
  await expect.poll(() => app.evaluate(() => (window as any).__soundCaptures.filter((c: any) => c.loop && !c.stopped).length)).toBe(1);
  expect((await app.evaluate(() => (window as any).__soundCaptures.findLast((c: any) => c.loop))).energy).toBeGreaterThan(0);
  await start.click();
  await expect.poll(() => app.evaluate(() => (window as any).__soundCaptures.filter((c: any) => c.loop && !c.stopped).length)).toBe(0);
  expect(errors).toEqual([]);
});
