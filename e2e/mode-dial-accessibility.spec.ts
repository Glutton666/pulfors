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

test("the opening dial captures a drag from its outer slots before the animation settles", async ({ page }) => {
  // Check hit testing at mount, before a locator's usual wait for stability
  // would let the opening animation hide the input gap.
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      const area = document.querySelector('[data-testid="mode-dial-swipe-area"]');
      if (!area) return;
      observer.disconnect();
      const x = window.innerWidth / 2 + 54;
      const hit = document.elementFromPoint(x, 87)?.closest('[data-testid="mode-dial-swipe-area"]');
      area.setAttribute("data-captured-at-open", String(hit === area));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  const trigger = page.getByTestId("mode-cycle-label");
  await trigger.click();
  await expect(page.getByTestId("mode-dial-swipe-area")).toHaveAttribute("data-captured-at-open", "true");

  const x = page.viewportSize()!.width / 2 + 54;
  await page.mouse.move(x, 87);
  await page.mouse.down();
  await page.mouse.move(x - 38, 87, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("mode-dial-touch-frame")).toHaveAttribute("aria-valuetext", "Bar");
  await page.mouse.click(x, page.viewportSize()!.height * 0.7);
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
