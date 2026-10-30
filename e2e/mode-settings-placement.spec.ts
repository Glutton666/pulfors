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

test("Beat settings switch sides only for landscape and leave the mode dial clear", async ({ page }) => {
  await boot(page);
  for (const viewport of sizes) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    const button = await reachable(page, "open-beat-settings");
    const trigger = await reachable(page, "mode-cycle-label");
    expect(button.y - trigger.y).toBeCloseTo(viewport.width > viewport.height ? 0 : 8, 1);
    const dial = (await page.getByTestId("circular-subdivision-dial").boundingBox())!;
    if (viewport.width > viewport.height) {
      expect(button.x).toBeGreaterThanOrEqual(24);
      expect(button.x + button.width).toBeLessThan(trigger.x);
    } else {
      expect(viewport.width - button.x - button.width).toBeGreaterThanOrEqual(24);
      expect(button.x).toBeGreaterThan(trigger.x + trigger.width);
    }
    expect(trigger.y + trigger.height).toBeLessThanOrEqual(dial.y + 1);
    await page.getByTestId("open-beat-settings").click();
    await expect(page.getByTestId("settings-close")).toBeVisible();
    await page.getByTestId("settings-close").click();
    await page.getByTestId("mode-cycle-label").click();
    await expect(page.getByTestId("mode-dial-fan")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("mode-dial-fan")).toHaveCount(0);
  }
  await page.setViewportSize(sizes[0]);
  await page.waitForTimeout(250);
  await page.screenshot({ path: "/tmp/beat-header-safe-portrait.png" });
});

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
    if (viewport.width < viewport.height) {
      const source = await reachable(page, "note-source-section-header");
      const queue = await reachable(page, "note-queue-workspace");
      const toolbar = await reachable(page, "note-playback-toolbar");
      expect(source.y + source.height).toBeLessThanOrEqual(queue.y + 1);
      expect(queue.y + queue.height).toBeLessThanOrEqual(toolbar.y + 1);
      expect(toolbar.y + toolbar.height).toBeGreaterThanOrEqual(viewport.height - 145);
      await expect(page.getByTestId("note-queue-workspace")).not.toContainText(/below|아래/);
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
  await page.setViewportSize(sizes[0]);
  await page.waitForTimeout(250);
  await page.screenshot({ path: "/tmp/note-layout-empty-portrait.png" });
});

test("Note import and queue remain usable with real entries across orientations", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("practice_book", JSON.stringify([{
      id: "note-layout-source", label: "Layout sample", mode: "beat", createdAt: 1,
      bpm: 120, beatsPerMeasure: 4, beatTypes: ["strong", "normal", "normal", "normal"],
      beatSubdivisions: {}, subdivisionPattern: ["normal"], barRepeats: {}, barLoopMode: "loop",
    }]));
  });
  await boot(page);
  await nextMode(page);
  await nextMode(page);
  await page.getByTestId("load-note-practice-sources").click();
  await page.getByRole("checkbox", { name: "Layout sample, 120 BPM" }).click();
  await page.getByRole("button", { name: /^(Load selected|선택 항목 불러오기)$/ }).click();
  const source = page.getByTestId("note-queue-source").getByText("Layout sample");
  await expect(source).toBeVisible();
  await source.click();
  await expect(page.getByText("Layout sample")).toHaveCount(2);
  for (const viewport of sizes) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    for (const id of ["mode-cycle-label", "load-note-practice-sources", "open-note-settings", "note-play-button"]) {
      await reachable(page, id);
    }
    await expect(page.getByText("Layout sample").first()).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      w: innerWidth, h: innerHeight,
      sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
    }));
    expect(dimensions.sw).toBeLessThanOrEqual(dimensions.w + 1);
    expect(dimensions.sh).toBeLessThanOrEqual(dimensions.h + 1);
  }
  await page.setViewportSize(sizes[0]);
  await page.waitForTimeout(250);
  await page.screenshot({ path: "/tmp/note-layout-populated.png" });
});
