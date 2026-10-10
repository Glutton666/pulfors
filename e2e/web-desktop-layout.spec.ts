import { expect, test, type Page } from "@playwright/test";

test.use({
  baseURL: process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "http://localhost:8081",
});

const DESKTOPS = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

async function start(page: Page, photo: boolean) {
  await page.addInitScript((showLandscapeImage) => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_settings", JSON.stringify({
      soundSet: "classic", showLandscapeImage,
    }));
  }, photo);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60000 });
}

async function reachable(page: Page, id: string) {
  const locator = page.getByTestId(id).first();
  await expect(locator).toBeVisible();
  const viewport = page.viewportSize()!;
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  return box!;
}

async function noOverflow(page: Page) {
  const dims = await page.evaluate(() => ({
    width: window.innerWidth, height: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(dims.scrollWidth).toBeLessThanOrEqual(dims.width + 1);
  expect(dims.scrollHeight).toBeLessThanOrEqual(dims.height + 1);
}

test.describe("web desktop practice layout", () => {
  for (const viewport of DESKTOPS) {
    for (const photo of [true, false]) {
      test(`${viewport.width}×${viewport.height}, photo ${photo}: separated controls remain usable`, async ({ page }) => {
        test.setTimeout(90000);
        await page.setViewportSize(viewport);
        await start(page, photo);
        const primary = await reachable(page, "metronome-primary-practice");
        const secondary = await reachable(page, "metronome-secondary-tools");
        expect(primary.x + primary.width + 20).toBeLessThanOrEqual(secondary.x);
        expect(primary.width).toBeGreaterThan(viewport.width * 0.35);
        const rail = await reachable(page, "beat-utility-rail");
        const dial = await reachable(page, "circular-subdivision-dial");
        expect(dial.x + dial.width).toBeLessThanOrEqual(rail.x);
        for (const id of ["open-beat-settings", "open-bar-mode", "open-note-mode", "play-button", "bpm-slider"]) {
          await reachable(page, id);
        }
        for (const id of ["open-beat-settings", "open-bar-mode", "open-note-mode"]) {
          const box = await reachable(page, id);
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        await expect(page.getByTestId("metronome-photo-or-stats")).toHaveCount(photo ? 1 : 0);
        const bpm = page.getByRole("slider", { name: "BPM" });
        await bpm.focus();
        await page.keyboard.press("Home");
        await expect(page.getByTestId("bpm-display")).toHaveText("20");
        await page.keyboard.press("ArrowRight");
        await expect(page.getByTestId("bpm-display")).toHaveText("21");
        await page.getByTestId("open-beat-settings").click();
        await expect(page.getByTestId("settings-close")).toBeVisible();
        await page.getByTestId("settings-close").click();
        await expect(page.getByTestId("settings-close")).not.toBeVisible();
        if (viewport.width === 1280 && photo) {
          const play = page.getByTestId("play-button");
          const stoppedIcon = await play.textContent();
          await play.click();
          await expect(play).not.toHaveText(stoppedIcon!);
          // Editing stays locked during preparing/playing and is restored by Stop.
          await bpm.focus();
          await page.keyboard.press("Home");
          await expect(page.getByTestId("bpm-display")).toHaveText("21");
          await play.click();
          await expect(play).toHaveText(stoppedIcon!);
          await bpm.focus();
          await page.keyboard.press("ArrowRight");
          await expect(page.getByTestId("bpm-display")).toHaveText("22");
        }
        await noOverflow(page);
      });
    }
  }

  test("resize and zoom-sized fallback keep tools reachable, then restore desktop", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize(DESKTOPS[1]);
    await start(page, false);
    for (const viewport of [
      { width: 960, height: 600 }, // 150% zoom equivalent CSS viewport
      { width: 1200, height: 1400 }, // portrait large window
      { width: 375, height: 812 },
      { width: 667, height: 375 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(page.getByTestId("metronome-desktop-layout")).toHaveCount(0);
      await reachable(page, "open-beat-settings");
      await reachable(page, "play-button");
      await noOverflow(page);
    }
    await page.setViewportSize(DESKTOPS[1]);
    await expect(page.getByTestId("beat-utility-rail")).toBeVisible();
    await reachable(page, "open-beat-settings");
  });

  test("desktop tools open Bar and Note without clipping their existing controls", async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize(DESKTOPS[0]);
    await start(page, false);
    await page.getByTestId("open-bar-mode").click();
    await expect(page.getByTestId("beat-indicator-bar-mode")).toBeVisible();
    await reachable(page, "mode-cycle-label");
    await reachable(page, "bar-editor-panel");
    await noOverflow(page);
    // Reload into the default Beat screen without changing saved mode profiles.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("open-note-mode")).toBeVisible();
    await page.getByTestId("open-note-mode").click();
    for (const id of ["mode-cycle-label", "open-note-settings", "save-note-mode", "reset-note-mode", "note-play-button"]) {
      await reachable(page, id);
    }
    await page.getByTestId("open-note-settings").click();
    await expect(page.getByTestId("settings-close")).toBeVisible();
    await page.getByTestId("settings-close").click();
    await noOverflow(page);
  });
});
