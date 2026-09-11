import { test, expect, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "320 portrait", width: 320, height: 568 },
  { name: "375 portrait", width: 375, height: 667 },
  { name: "667x375 landscape", width: 667, height: 375 },
  { name: "768x1024 tablet", width: 768, height: 1024 },
  { name: "1280x800 web", width: 1280, height: 800 },
] as const;

async function skipOnboarding(page: Page) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const skip = page.getByText(/건너뛰기|Skip/i);
    if ((await skip.count()) === 0) return;
    await skip.first().click();
    await page.waitForTimeout(250);
  }
}

async function openSignalGenerator(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("viewportSize() is unavailable");

  await page.locator('[data-testid="mode-cycle-label"]').click();
  await page.waitForTimeout(400);
  await page.mouse.click(viewport.width / 2 - 58, 86);
  await page.waitForTimeout(300);
  await page.mouse.click(viewport.width / 2, viewport.height * 0.7);
  await page.waitForTimeout(600);
  await page
    .getByRole("menuitem", { name: /signal generator|시그널 제너레이터/i })
    .click();
  await page.locator('[data-testid="signal-toggle"]').waitFor({
    state: "attached",
    timeout: 10000,
  });
}

test.describe("responsive smoke @responsive", () => {
  for (const viewport of VIEWPORTS) {
    test(`core controls are reachable without horizontal overflow at ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.locator('[data-testid="mode-cycle-label"]').waitFor({
        state: "visible",
        timeout: 20000,
      });
      await skipOnboarding(page);

      await expect(page.locator('[data-testid="mode-cycle-label"]')).toBeVisible();
      await expect(page.locator('[data-testid="beat-indicator-swipe"]')).toBeVisible();
      await expect(page.locator('[data-testid="play-button"]')).toBeVisible();

      const overflow = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        viewport: window.innerWidth,
      }));
      expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
      expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);

      for (const selector of ["mode-cycle-label", "play-button"]) {
        const box = await page.locator(`[data-testid="${selector}"]`).boundingBox();
        expect(box, `${selector} should have a reachable box`).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
      }
    });
  }

  test("desktop keyboard can focus and adjust the BPM slider", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="mode-cycle-label"]').waitFor({
      state: "visible",
      timeout: 20000,
    });
    await skipOnboarding(page);

    const slider = page.getByRole("slider", { name: "BPM" });
    await expect(slider).toBeVisible();
    await page.locator("body").click({ position: { x: 2, y: 2 } });

    let reachedSlider = false;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      await page.keyboard.press("Tab");
      reachedSlider = await page.evaluate(
        () => document.activeElement?.getAttribute("role") === "slider",
      );
      if (reachedSlider) break;
    }
    expect(reachedSlider).toBe(true);

    await page.keyboard.press("Home");
    await expect(page.locator('[data-testid="bpm-display"]')).toHaveText("20");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-testid="bpm-display"]')).toHaveText("21");
    await page.keyboard.press("End");
    await expect(page.locator('[data-testid="bpm-display"]')).toHaveText("300");
  });

  test("tuning guide stays within a 320px viewport", async ({ page }) => {
    const viewport = { width: 320, height: 568 };
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="mode-cycle-label"]').waitFor({
      state: "visible",
      timeout: 20000,
    });
    await skipOnboarding(page);
    await openSignalGenerator(page);

    const tuningButton = page.locator('[data-testid="signal-tuning-guide"]').first();
    await tuningButton.scrollIntoViewIfNeeded();
    await expect(tuningButton).toBeVisible();
    await tuningButton.click();
    const card = page.locator('[data-testid="tuning-guide-card"]');
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  });
});