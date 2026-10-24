import { expect, test, type Page } from "@playwright/test";

test.use({
  baseURL: process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : undefined,
});

async function openMenu(page: Page) {
  const viewport = page.viewportSize()!;
  await page.getByTestId("mode-cycle-label").click();
  await page.waitForTimeout(400);
  await page.mouse.click(viewport.width / 2 - 58, 86);
  await page.waitForTimeout(300);
  await page.mouse.click(viewport.width / 2, viewport.height * 0.7);
  await expect(page.getByTestId("menu-profile")).toBeVisible();
}

async function openCommonProfile(page: Page) {
  await openMenu(page);
  await page.getByRole("menuitem", { name: /설정|settings/i }).click();
  await expect(page.getByTestId("settings-close")).toBeVisible();
  await page.getByRole("button", { name: /^(프로필|Profile)$/ }).click();
  await expect(page.getByTestId("settings-username")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
  });
});

for (const viewport of [
  { width: 375, height: 667 },
  { width: 780, height: 390 },
  { width: 1024, height: 768 },
]) {
  test(`common management is restored in settings at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60_000 });
    await openCommonProfile(page);

    await expect(page.getByTestId("profile-screen")).toHaveCount(0);
    await expect(page.getByTestId("primary-instrument-search")).toBeVisible();
    await page.getByTestId("settings-username").fill("Shared profile");
    await page.getByTestId("primary-instrument-search").click();
    await expect(page.getByTestId("settings-backup-export")).toBeAttached();
    await expect(page.getByTestId("settings-backup-import")).toBeAttached();
    const reset = page.getByText(/^(앱 초기화 및 재시작|Reset App & Restart)$/);
    await reset.click();
    await expect(page.getByText(/모든 설정과 데이터가 삭제됩니다|All settings and data will be deleted/)).toBeVisible();
    await page.getByText(/^(취소|Cancel)$/).click();
    await expect(page.getByText(/모든 설정과 데이터가 삭제됩니다|All settings and data will be deleted/)).toHaveCount(0);
    await page.getByRole("button", { name: /^(테마|Theme)$/ }).click();
    await page.getByRole("button", { name: /^(프로필|Profile)$/ }).click();
    await expect(page.getByTestId("settings-username")).toHaveValue("Shared profile");
    await page.screenshot({ path: `/tmp/settings-common-management-${viewport.width}.jpg` });

    if (viewport.width === 375) {
      const download = page.waitForEvent("download");
      await page.getByTestId("settings-backup-export").click();
      expect((await download).suggestedFilename()).toMatch(/backup/i);
      await expect(page.getByTestId("web-alert-backdrop")).toBeVisible();
      await page.getByTestId("web-alert-backdrop").click({ position: { x: 5, y: 5 } });
    }

    await page.getByTestId("settings-close").click();
    await page.getByTestId("menu-profile").click();
    await expect(page.getByTestId("profile-screen")).toBeVisible();
    await expect(page.getByTestId("settings-username")).toHaveValue("Shared profile");
  });
}

test("mode-specific settings do not expose global profile management", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("open-beat-settings").first().click({ force: true });
  await expect(page.getByTestId("settings-close")).toBeVisible();
  await expect(page.getByRole("button", { name: /^(프로필|Profile)$/ })).toHaveCount(0);
  await expect(page.getByTestId("settings-backup-export")).toHaveCount(0);
});
