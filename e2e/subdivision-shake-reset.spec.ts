import { test, expect, type Page } from "@playwright/test";

async function skipOnboarding(page: Page) {
  for (let i = 0; i < 5; i++) {
    const skip = page.getByRole("button").filter({ hasText: /건너뛰기|skip/i });
    if (await skip.count() === 0) break;
    await skip.first().click();
  }
}

async function swipeSubdivision(page: Page, deltaX: number) {
  const cells = page.locator('[data-testid="subdivision-cells"]');
  const box = await cells.boundingBox();
  if (!box) throw new Error("Subdivision bar bounding box not found");

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y);
  await page.mouse.up();
}

test.describe("SubdivisionBar shake reset on web", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="mode-cycle-label"]').waitFor({ state: "visible", timeout: 20000 });
    await skipOnboarding(page);
    await page.locator('[data-testid="subdivision-cell-0"]').waitFor({ state: "visible", timeout: 10000 });
  });

  test("left-right reversals reset a multi-cell pattern", async ({ page }) => {
    const cells = page.locator('[data-testid^="subdivision-cell-"]');

    // Make a three-cell pattern first. A normal left swipe only removes one
    // cell, while a completed shake must return it all the way to one cell.
    await swipeSubdivision(page, 40);
    await swipeSubdivision(page, 40);
    await expect(cells).toHaveCount(3);

    const bar = page.locator('[data-testid="subdivision-cells"]');
    const box = await bar.boundingBox();
    if (!box) throw new Error("Subdivision bar bounding box not found");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    for (const offset of [-35, -10, -30, -5, -25]) {
      await page.mouse.move(x + offset, y);
      await page.waitForTimeout(40);
    }
    await page.mouse.up();

    await expect(cells).toHaveCount(1);
  });
});