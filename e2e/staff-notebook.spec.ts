import { test, expect, type Page } from "@playwright/test";

test.use({
  baseURL: process.env.NOTEBOOK_TEST_URL ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : undefined),
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  isMobile: false, hasTouch: false,
});
test.setTimeout(100000);

async function openNotebook(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
    localStorage.setItem("metronome_lab_unlocked", "true");
    localStorage.setItem("practice_book", JSON.stringify([{
      id: "notebook-test-pattern", label: "Notebook 4/4 reference", createdAt: 1, mode: "beat",
      bpm: 60, beatsPerMeasure: 4, beatTypes: ["accent", "normal", "mute", "normal"],
      beatSubdivisions: { "1": ["normal", "normal"] }, barRepeats: {}, barLoopMode: "loop", subdivisionPattern: [],
    }]));
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("mode-cycle-label").waitFor({ timeout: 60000 });
  const skip = page.getByText(/건너뛰기|Skip/i).first();
  if (await skip.isVisible()) await skip.click();
  const vp = page.viewportSize()!;
  await page.getByTestId("mode-cycle-label").click();
  await page.waitForTimeout(400);
  await page.mouse.click(vp.width / 2 - 58, 86);
  await page.waitForTimeout(350);
  await page.mouse.click(vp.width / 2, vp.height * 0.7);
  await page.getByTestId("menu-lab").click();
  await page.getByTestId("menu-staff-notebook").click();
  await expect(page.getByTestId("notebook-drawing")).toBeVisible();
}
async function closeNotice(page: Page) {
  const ok = page.getByText(/^OK$|^확인$/).last();
  if (await ok.isVisible()) await ok.click();
}

test("paper fills tablet, dial does not exit, stamps preview and persist with ink", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openNotebook(page);
  const paper = page.getByTestId("notebook-drawing");
  const before = await paper.boundingBox();
  expect(before!.width).toBeGreaterThan(760);
  await page.getByTestId("mode-cycle-label").click();
  await page.waitForTimeout(400);
  await page.mouse.click(384, 900);
  await expect(page.getByTestId("mode-dial-fan")).toHaveCount(0);
  await expect(paper).toBeVisible();
  await expect(page.getByTestId("mode-cycle-label")).toContainText(/오선|Staff/);
  const box = (await paper.boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 90);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 100, { steps: 8 });
  await page.mouse.up();
  await page.getByTestId("notebook-right-toggle").click();
  await page.getByTestId("notebook-symbol-quarter").click();
  await expect(page.getByTestId("notebook-stamp-confirm")).toBeVisible();
  await page.getByTestId("notebook-stamp-confirm").click();
  await page.getByTestId("notebook-left-toggle").click();
  await page.getByTestId("notebook-line-unit-phrase").click();
  await page.getByTestId("notebook-follow").click();
  await page.getByTestId("notebook-save").click();
  await expect.poll(() => page.evaluate(() => {
    const notes = JSON.parse(localStorage.getItem("lab_staff_notebooks_v1") ?? "[]");
    return notes[0]?.pages[0]?.stamps?.length;
  })).toBe(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0]);
  expect(saved.pages[0].strokes).toHaveLength(1);
  expect(saved.pages[0].stamps[0].x).toBeGreaterThan(240);
  expect(saved.settings.lineUnit).toBe("phrase");
  expect(saved.settings.follow).toBe(true);
  await closeNotice(page);
  await page.getByTestId("notebook-panel-close").click();
  await page.screenshot({ path: "/tmp/notebook-tablet-verified.png" });
  expect(errors).toEqual([]);
});

test("phone imports real pattern, starts audio, stops on settings edits, and cancels glyph preview", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openNotebook(page);
  await page.getByTestId("notebook-right-toggle").click();
  await page.getByTestId("notebook-symbol-sharp").click();
  await page.getByTestId("notebook-stamp-cancel").click();
  await page.getByTestId("notebook-left-toggle").click();
  await page.getByText(/^패턴 불러오기$|^Load pattern$/).click();
  await page.getByText("Notebook 4/4 reference").click();
  await page.getByTestId("notebook-play").click();
  await expect(page.getByTestId("notebook-play")).toContainText(/정지|Stop/, { timeout: 30000 });
  await page.getByTestId("notebook-line-unit-phrase").click();
  await expect(page.getByTestId("notebook-play")).toContainText(/재생|Play/);
  await page.getByTestId("notebook-save").click();
  await expect.poll(() => page.evaluate(() => {
    const notes = JSON.parse(localStorage.getItem("lab_staff_notebooks_v1") ?? "[]");
    return notes[0]?.settings?.source?.id;
  })).toBe("notebook-test-pattern");
  const notes = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!));
  expect(notes[0].pages[0].stamps).toHaveLength(0);
  await closeNotice(page);
  await page.getByTestId("notebook-panel-close").click();
  await page.screenshot({ path: "/tmp/notebook-phone-verified.png" });
});

test("random playback follows the rendered sheet and leaves the saved original unchanged", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.addInitScript(() => {
    localStorage.setItem("lab_staff_notebooks_v1", JSON.stringify([{
      id: "follow-reference", title: "Follow reference", updatedAt: 10,
      pages: [
        { id: "a", staffCount: 2, strokes: [{ id: "ink", width: 3, points: [{ x: 70, y: 102 }, { x: 110, y: 112 }] }], stamps: [{ id: "mark", glyph: "sharp", x: 140, y: 102, size: 26 }] },
        { id: "b", staffCount: 1, strokes: [{ id: "other", width: 2, points: [{ x: 180, y: 102 }, { x: 220, y: 112 }] }] },
      ],
      settings: { follow: true, lineUnit: "measure", playbackZoom: 1.5, random: true, bpm: 120, offsetX: 0, offsetY: 0, snap: true,
        source: { id: "four", label: "Follow 4/4", createdAt: 1, mode: "beat", bpm: 120, beatsPerMeasure: 4, beatTypes: ["accent", "normal", "normal", "normal"], beatSubdivisions: {}, barRepeats: {}, barLoopMode: "loop", subdivisionPattern: [] } },
    }]));
  });
  await openNotebook(page);
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0].pages);
  await page.getByTestId("notebook-left-toggle").click();
  await page.getByLabel(/^Open notebook$|^노트 열기$/).click();
  await page.getByTestId("notebook-play").click();
  await expect(page.getByTestId("notebook-play")).toContainText(/정지|Stop/, { timeout: 30000 });
  await page.getByTestId("notebook-panel-close").click();
  await expect.poll(() => page.getByTestId("notebook-horizontal-scroll").evaluate((node) => node.scrollLeft)).toBeGreaterThan(50);
  await expect.poll(() => page.getByTestId("notebook-vertical-scroll").evaluate((node) => node.scrollTop)).toBeGreaterThan(50);
  await page.screenshot({ path: "/tmp/notebook-follow-verified.png" });
  await page.getByTestId("notebook-left-toggle").click();
  await page.getByTestId("notebook-play").click();
  await page.getByTestId("notebook-save").click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0]);
  // Loading older pages supplies an empty stamp collection; ink, marks,
  // staff counts and page order must otherwise be identical.
  expect(saved.pages).toEqual(original.map((p: typeof saved.pages[number]) => ({ ...p, stamps: p.stamps ?? [] })));
});

test("simple metronome continues beyond the last row until Stop or notebook exit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const scope = window as typeof window & { __notebookSources: Array<{ loop: boolean; ended: boolean }> };
    scope.__notebookSources = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const info = { loop: this.loop, ended: false };
      scope.__notebookSources.push(info);
      this.addEventListener("ended", () => { info.ended = true; });
      return start.apply(this, args);
    };
    localStorage.setItem("lab_staff_notebooks_v1", JSON.stringify([{
      id: "continuous-click", title: "Continuous reference", updatedAt: 1,
      pages: [{ id: "one", staffCount: 1, strokes: [] }],
      settings: { follow: true, lineUnit: "measure", playbackZoom: 1, random: false, bpm: 300, offsetX: 0, offsetY: 0, snap: true },
    }]));
  });
  await openNotebook(page);
  await page.getByTestId("notebook-left-toggle").click();
  await page.getByLabel(/^Open notebook$|^노트 열기$/).click();
  await page.getByTestId("notebook-play").click();
  await expect(page.getByTestId("notebook-play")).toContainText(/정지|Stop/, { timeout: 30000 });
  // This one-row notebook lasts 200ms. Six passes must not stop its click.
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("notebook-play")).toContainText(/정지|Stop/);
  expect(await page.evaluate(() => (window as typeof window & { __notebookSources: Array<{ loop: boolean; ended: boolean }> })
    .__notebookSources.some((source) => source.loop && !source.ended))).toBe(true);
  await page.getByTestId("notebook-play").click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __notebookSources: Array<{ loop: boolean; ended: boolean }> })
    .__notebookSources.filter((source) => source.loop && !source.ended).length)).toBe(0);
  await page.getByTestId("notebook-play").click();
  await expect(page.getByTestId("notebook-play")).toContainText(/정지|Stop/);
  await page.getByTestId("notebook-panel-close").click();
  await page.getByTestId("notebook-close").click();
  await expect(page.getByTestId("notebook-drawing")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __notebookSources: Array<{ loop: boolean; ended: boolean }> })
    .__notebookSources.filter((source) => source.loop && !source.ended).length)).toBe(0);
});
