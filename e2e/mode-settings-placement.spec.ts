import { expect, test, type Page } from "@playwright/test";

test.use({
  baseURL: process.env.SETTINGS_TEST_URL ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : undefined),
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  isMobile: false, hasTouch: false,
});
test.setTimeout(100000);

const sizes = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
];

async function boot(page: Page) {
  await page.setViewportSize(sizes[0]);
  await page.addInitScript(() => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("mode-cycle-label").waitFor({ timeout: 60000 });
  const skip = page.getByText(/Skip|건너뛰기/).first();
  if (await skip.isVisible()) await skip.click();
}

async function nextMode(page: Page) {
  const vp = page.viewportSize()!;
  await page.getByTestId("mode-cycle-label").click();
  await page.waitForTimeout(350);
  await page.mouse.click(vp.width / 2 + 58, 86);
  await page.waitForTimeout(300);
  await page.mouse.click(vp.width / 2, vp.height * 0.7);
  await expect(page.getByTestId("mode-dial-fan")).toHaveCount(0);
}

async function reachable(page: Page, id: string) {
  const target = page.getByTestId(id);
  await expect(target).toHaveCount(1);
  await expect(target).toBeVisible();
  const box = (await target.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  return box;
}

test("Bar settings stay in the original editor toolbar, not a floating global button", async ({ page }) => {
  await boot(page);
  await nextMode(page);
  for (const viewport of sizes) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    await expect(page.getByTestId("open-beat-settings")).toHaveCount(0);
    const button = await reachable(page, "open-bar-settings");
    const panel = (await page.getByTestId("bar-editor-panel").boundingBox())!;
    expect(button.y).toBeGreaterThanOrEqual(panel.y);
    expect(button.y + button.height).toBeLessThanOrEqual(panel.y + panel.height + 1);
    await page.getByTestId("open-bar-settings").click();
    await expect(page.getByTestId("settings-close")).toBeVisible();
    await page.getByTestId("settings-close").click();
  }
  await page.screenshot({ path: "/tmp/bar-settings-restored.png" });
});

test("Note settings and document actions remain reachable after resizing", async ({ page }) => {
  await boot(page);
  await nextMode(page);
  await nextMode(page);
  for (const viewport of sizes) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    for (const id of ["open-note-settings", "save-note-mode", "reset-note-mode", "note-play-button"]) {
      await reachable(page, id);
    }
    if (viewport.width > viewport.height) {
      await expect(page.getByTestId("save-note-mode")).not.toContainText(/Save|Saved|저장/);
      await expect(page.getByTestId("reset-note-mode")).not.toContainText(/Reset|초기화/);
    }
    await expect(page.getByTestId("open-beat-settings")).toHaveCount(0);
    await page.getByTestId("open-note-settings").click();
    await expect(page.getByTestId("settings-close")).toBeVisible();
    await page.getByTestId("settings-close").click();
  }
  await page.screenshot({ path: "/tmp/note-settings-refined.png" });
});
