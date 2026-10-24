import { expect, test, type Page } from "@playwright/test";

test.use({
  baseURL: process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : undefined,
});

async function prepare(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
    localStorage.setItem("metronome_activity_settings", JSON.stringify({ loggingEnabled: true }));
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60_000 });
}

async function openMenu(page: Page) {
  const viewport = page.viewportSize()!;
  await page.getByTestId("mode-cycle-label").click();
  await page.waitForTimeout(400);
  await page.mouse.click(viewport.width / 2 - 58, 86);
  await page.waitForTimeout(300);
  await page.mouse.click(viewport.width / 2, viewport.height * 0.7);
  await expect(page.getByTestId("menu-profile")).toBeVisible();
}

async function expectFullScreen(page: Page, id: string) {
  const surface = page.getByTestId(id);
  await expect(surface).toBeVisible();
  // A newly presented slide surface can be visible while still moving.
  await expect.poll(async () => {
    const bounds = await surface.boundingBox();
    return bounds ? Math.abs(bounds.y) : Infinity;
  }).toBeLessThanOrEqual(2);
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(Math.abs(bounds!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(bounds!.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(bounds!.width - viewport.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(bounds!.height - viewport.height)).toBeLessThanOrEqual(2);
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 2,
  );
  expect(horizontalOverflow).toBe(false);
}

for (const viewport of [
  { width: 375, height: 667 },
  { width: 667, height: 375 },
  { width: 1024, height: 768 },
]) {
  test(`independent screens fill ${viewport.width}×${viewport.height} and return`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await prepare(page);
    await openMenu(page);

    await page.getByTestId("menu-profile").click();
    await expectFullScreen(page, "profile-screen");
    await page.getByTestId("profile-close").click();
    await expect(page.getByTestId("menu-profile")).toBeVisible();

    await page.getByRole("menuitem", { name: /시그널 제너레이터|signal generator/i }).click();
    await expectFullScreen(page, "signal-generator-screen");
    if (viewport.width === 375) {
      await page.screenshot({ path: "/tmp/feature-screen-tuner.jpg" });
    }
    await page.getByTestId("signal-tuning-guide").click();
    await expectFullScreen(page, "tuning-guide-screen");
    await expect(page.getByTestId("signal-generator-screen")).toBeHidden();
    await page.getByTestId("tuning-guide-screen")
      .getByRole("button", { name: /닫기|close/i }).click();
    await expectFullScreen(page, "signal-generator-screen");
    await page.getByTestId("signal-generator-screen")
      .getByRole("button", { name: /닫기|close/i }).click();
    await expect(page.getByTestId("menu-profile")).toBeVisible();

    await page.getByTestId("menu-work-up").click();
    await expectFullScreen(page, "work-up-screen");
    await page.getByRole("button", { name: /공유|share/i, exact: true }).click();
    await expectFullScreen(page, "work-up-share-screen");
    await expect(page.getByTestId("work-up-screen")).toBeHidden();
    await page.getByTestId("work-up-share-back").click();
    await expectFullScreen(page, "work-up-screen");
    await page.getByTestId("work-up-screen")
      .getByRole("button", { name: /닫기|close/i }).click();
    await expect(page.getByTestId("menu-profile")).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("practice book export replaces the book and returns without closing it", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.addInitScript(() => {
    localStorage.setItem("practice_book", JSON.stringify([{
      id: "screen-navigation-fixture",
      label: "화면 전환 테스트",
      createdAt: Date.now(),
      mode: "beat",
      bpm: 120,
      beatsPerMeasure: 4,
      beatTypes: ["accent", "normal", "normal", "normal"],
      beatSubdivisions: {},
      barRepeats: {},
      barLoopMode: "loop",
      subdivisionPattern: [],
    }]));
  });
  await prepare(page);
  await page.getByTestId("mode-cycle-label").click();
  await page.waitForTimeout(400);
  await page.mouse.click(375 / 2 - 96, 39);
  await page.waitForTimeout(300);
  await page.mouse.click(375 / 2, 667 * 0.7);
  await expectFullScreen(page, "practice-book-screen");
  await page.getByTestId("practice-view-toggle").click();
  await page.getByTestId("export-grid-screen-navigation-fixture").click();
  await expectFullScreen(page, "practice-export-screen");
  await expect(page.getByTestId("practice-book-screen")).toBeHidden();
  await page.getByTestId("export-close-btn").click();
  await expectFullScreen(page, "practice-book-screen");
});
