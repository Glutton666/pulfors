import { expect, test, type Page } from "@playwright/test";

async function skipOnboarding(page: Page) {
  for (let i = 0; i < 8; i += 1) {
    const skip = page.getByText(/건너뛰기|Skip/i);
    if ((await skip.count()) === 0) break;
    await skip.first().click();
    await page.waitForTimeout(300);
  }
}

async function openBeatPracticeSettings(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="mode-cycle-label"]').waitFor({ state: "visible", timeout: 20_000 });
  await skipOnboarding(page);

  await page.locator('[data-testid="open-beat-settings"]').first().click({ force: true });
  await expect(page.locator('[data-testid="settings-close"]')).toBeVisible();

  await page.getByRole("button", { name: /연습장|Practice/i }).click();
  await expect(page.locator('[data-testid="embedded-practice-book"]')).toBeVisible();
}

test("비트 연습장이 설정 탭 안에서 열리고 다른 설정 탭으로 돌아갈 수 있다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openBeatPracticeSettings(page);

  await expect(page.locator('[data-testid="settings-close"]')).toBeVisible();

  await page.getByRole("button", { name: /테마|Theme/i }).click();
  await expect(page.locator('[data-testid="embedded-practice-book"]')).toBeHidden();
  await expect(page.locator('[data-testid="settings-close"]')).toBeVisible();
});

test("가로 화면에서도 설정 안 연습장이 화면 경계 안에 유지된다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openBeatPracticeSettings(page);
  await page.setViewportSize({ width: 780, height: 390 });
  await page.waitForTimeout(250);

  const bookBounds = await page.locator('[data-testid="embedded-practice-book"]').boundingBox();
  expect(bookBounds).not.toBeNull();
  expect(bookBounds!.x).toBeGreaterThanOrEqual(0);
  expect(bookBounds!.y).toBeGreaterThanOrEqual(0);
  expect(bookBounds!.x + bookBounds!.width).toBeLessThanOrEqual(780);
  expect(bookBounds!.y + bookBounds!.height).toBeLessThanOrEqual(390);
});