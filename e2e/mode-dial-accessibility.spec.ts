import { expect, test } from "@playwright/test";

test.use({
  baseURL: process.env.SETTINGS_TEST_URL,
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  isMobile: false, hasTouch: false,
});
test.setTimeout(90000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
    localStorage.setItem("metronome_language", "en");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60000 });
});

test("dial reports selection, handles arrows/confirmation and restores trigger focus after Escape", async ({ page }) => {
  const trigger = page.getByTestId("mode-cycle-label");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  const dial = page.getByTestId("mode-dial-touch-frame");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(dial).toHaveAttribute("role", "slider");
  await expect(dial).toHaveAttribute("aria-valuemin", "1");
  await expect(dial).toHaveAttribute("aria-valuemax", "5");
  await expect(dial).toHaveAttribute("aria-valuenow", "1");
  for (const [key, next] of [["ArrowRight", "2"], ["ArrowDown", "3"], ["ArrowUp", "2"], ["ArrowLeft", "1"]]) {
    await page.keyboard.press(key);
    await expect(dial).toHaveAttribute("aria-valuenow", next);
  }
  await page.keyboard.press("Escape");
  await expect(dial).toHaveCount(0);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(dial).toHaveCount(0);
  await expect(trigger).toHaveAccessibleName(/Bar$/);
});

test("Note controls stay below the measured header after keyboard selection and rotation", async ({ page }) => {
  const trigger = page.getByTestId("mode-cycle-label");
  await trigger.click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("mode-dial-touch-frame")).toHaveCount(0);
  await expect(trigger).toHaveAccessibleName(/Note$/);
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      const header = await page.getByTestId("main-mode-header").boundingBox();
      const save = await page.getByTestId("save-note-mode").boundingBox();
      return !!header && !!save && save.y >= header.y + header.height - 1;
    }).toBe(true);
  }
});
