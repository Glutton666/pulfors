import { expect, test } from "@playwright/test";

test.use({
  baseURL: process.env.SETTINGS_TEST_URL,
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  },
});
test.setTimeout(90000);

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`score list and editor exits remain tappable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem("metronome_onboarding_done", "1");
      localStorage.setItem("metronome_onboarding_lang_done", "1");
      localStorage.setItem("metronome_lab_unlocked", "true");
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60000 });
    const skip = page.getByText(/Skip|건너뛰기/).first();
    if (await skip.isVisible()) await skip.click();
    await page.getByTestId("mode-cycle-label").click();
    await page.waitForTimeout(400);
    await page.mouse.click(viewport.width / 2 - 58, 86);
    await page.waitForTimeout(300);
    await page.mouse.click(viewport.width / 2, viewport.height * 0.7);
    await page.getByTestId("menu-lab").click();
    await page.getByTestId("menu-score").click();
    await page.getByTestId("score-list-close").click();
    await expect(page.getByTestId("score-list-close")).toHaveCount(0);
    await expect(page.getByTestId("menu-score")).toBeVisible();

    await page.getByTestId("menu-score").click();
    await page.getByTestId("score-list-empty-new").click();
    await page.getByTestId("score-new-create").click();
    await page.getByTestId("score-editor-back").click();
    await page.getByTestId("score-list-close").click();
    await expect(page.getByTestId("score-list-close")).toHaveCount(0);
    await expect(page.getByTestId("menu-score")).toBeVisible();

    await page.getByTestId("menu-score").click();
    await page.getByTestId("score-list-new").click();
    await page.getByTestId("score-new-create").click();
    await page.getByTestId("score-editor-close").click();
    await expect(page.getByTestId("score-editor-close")).toHaveCount(0);
    await expect(page.getByTestId("menu-score")).toBeVisible();
  });
}
