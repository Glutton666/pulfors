import { test, expect, type Page } from "@playwright/test";
import type { StaffNotebook } from "../lib/staff-notebook";

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
  await enterNotebook(page);
}

async function enterNotebook(page: Page) {
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
  await page.getByTestId("notebook-left-toggle").click();
  await page.getByLabel(/^Open notebook$|^노트 열기$/).click();
  // Saving first makes viewport padding explicit; playback must not reorder this document.
  await page.getByTestId("notebook-save").click();
  await closeNotice(page);
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0].pages);
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
  // Viewport-filling rows extend this phone sheet to <4 seconds at BPM300.
  // The click must continue even after the complete padded sheet.
  await page.waitForTimeout(4000);
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

test("phone lower visible rows accept symbol-only edits and preserve their saved positions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openNotebook(page);
  await page.getByTestId("notebook-right-toggle").click();
  await page.getByTestId("notebook-symbol-quarter").click();
  const box = (await page.getByTestId("notebook-drawing").boundingBox())!;
  const targetY = 9 * 155 + 102;
  await page.mouse.click(box.x + 100 * 390 / 900, box.y + targetY * 390 / 900);
  await page.getByTestId("notebook-stamp-confirm").click();
  await page.getByTestId("notebook-left-toggle").click();
  await page.getByTestId("notebook-save").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1") ?? "[]")[0]?.pages[0]?.stamps?.length)).toBe(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0]);
  expect(saved.pages[0].staffCount).toBeGreaterThanOrEqual(10);
  expect(saved.pages[0].strokes).toHaveLength(0);
  expect(saved.pages[0].stamps[0].y).toBeCloseTo(targetY, 0);
  await closeNotice(page);
  await page.getByLabel(/^Open notebook$|^노트 열기$/).click();
  await page.getByTestId("notebook-save").click();
  const reopened = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0]);
  expect(reopened.pages[0]).toEqual(saved.pages[0]);
});

// Use real browser storage, drawing gestures and dialogs. Only the failing
// write is injected; no workspace state or save handler is mocked.
const notebookKey = "lab_staff_notebooks_v1";
const originalNote: StaffNotebook = {
  id: "guard-original", title: "Guard original", updatedAt: 10,
  pages: [{
    id: "guard-page", staffCount: 12,
    strokes: [{ id: "original-ink", width: 2.5, points: [{ x: 80, y: 100 }, { x: 120, y: 110 }] }],
    stamps: [{ id: "original-mark", glyph: "sharp", x: 160, y: 102, size: 26 }],
  }],
  settings: {
    follow: false, lineUnit: "measure", playbackZoom: 1, bpm: 84,
    random: false, offsetX: 0, offsetY: 0, snap: true,
  },
};
const otherNote: StaffNotebook = {
  ...originalNote, id: "guard-other", title: "Guard other", updatedAt: 5,
  pages: [{ id: "other-page", staffCount: 14, strokes: [], stamps: [] }],
  settings: { ...originalNote.settings!, bpm: 96 },
};
const editedTitle = "Guard edited";
const titleInput = (page: Page) => page.getByPlaceholder(/^Notebook title$|^노트 제목$/);
const openSaved = (page: Page, title: string) => page.getByText(title, { exact: true })
  .locator("..").locator("..").getByLabel(/^Open notebook$|^노트 열기$/).click();
const storedNotes = (page: Page): Promise<StaffNotebook[]> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), notebookKey);
const storedRaw = (page: Page) => page.evaluate((key) => localStorage.getItem(key), notebookKey);
const paperContents = (page: Page) => page.getByTestId("notebook-drawing").locator("svg").evaluate((svg) => {
  const document = svg.cloneNode(true) as SVGElement;
  // Selection is editor state, not saved ink. Loading correctly clears it.
  document.querySelectorAll('path[stroke="#a36f36"]').forEach((outline) => outline.remove());
  return document.innerHTML;
});

async function openGuardReference(page: Page) {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.addInitScript(({ key, notes }) => localStorage.setItem(key, JSON.stringify(notes)),
    { key: notebookKey, notes: [originalNote, otherNote] });
  await openNotebook(page);
  await page.getByTestId("notebook-left-toggle").click();
  await openSaved(page, originalNote.title);
  await expect(titleInput(page)).toHaveValue(originalNote.title);
  return { raw: await storedRaw(page), paper: await paperContents(page) };
}

async function editGuardReference(page: Page) {
  await page.getByTestId("notebook-panel-close").click();
  const box = (await page.getByTestId("notebook-drawing").boundingBox())!;
  await page.mouse.move(box.x + 210, box.y + 110);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 125, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId("notebook-right-toggle").click();
  await page.getByTestId("notebook-symbol-quarter").click();
  await page.getByTestId("notebook-stamp-confirm").click();
  await page.getByTestId("notebook-right-toggle").click();
  await page.getByText(/^Add staff$|^오선 추가$/).click();
  await page.getByTestId("notebook-panel-close").click();
  await expect(page.getByTestId("notebook-drawing").locator('line[stroke="#141414"]')).toHaveCount(13 * 5);
  await page.getByTestId("notebook-left-toggle").click();
  await titleInput(page).fill(editedTitle);
  await page.getByTestId("notebook-bpm").fill("113");
  await page.getByTestId("notebook-line-unit-phrase").click();
  await page.getByTestId("notebook-follow").click();
  await page.getByTestId("notebook-random").click();
  await page.getByTestId("notebook-playback-zoom").click();
  return paperContents(page);
}

type GuardPath = "exit" | "new" | "open";
async function requestGuardAction(page: Page, path: GuardPath) {
  if (path === "exit") {
    await page.getByTestId("notebook-panel-close").click();
    await page.getByTestId("notebook-close").click();
  } else if (path === "new") {
    await page.getByText(/^New notebook$|^새 노트$/).click();
  } else {
    await openSaved(page, otherNote.title);
  }
  await expect(page.getByTestId("web-alert")).toContainText(/Discard unsaved|저장하지 않은 변경/);
}

async function assertDraftIntact(page: Page, paper: string, path: GuardPath) {
  await expect.poll(() => paperContents(page)).toBe(paper);
  if (path === "exit") await page.getByTestId("notebook-left-toggle").click();
  await expect(titleInput(page)).toHaveValue(editedTitle);
  await expect(page.getByTestId("notebook-bpm")).toHaveValue("113");
}

async function assertDestination(page: Page, path: GuardPath) {
  await expect(page.getByTestId("web-alert")).toHaveCount(0);
  if (path === "exit") {
    await expect(page.getByTestId("notebook-drawing")).toHaveCount(0);
    // Exit returns to the Lab menu. Re-enter without reloading browser storage.
    await page.getByTestId("menu-staff-notebook").click();
    await expect(page.getByTestId("notebook-drawing")).toBeVisible();
    await page.getByTestId("notebook-left-toggle").click();
  } else {
    await expect(titleInput(page)).toHaveValue(path === "new" ? "Untitled notebook" : otherNote.title);
    await expect(page.getByTestId("notebook-drawing").locator("path")).toHaveCount(0);
    await expect(page.getByTestId("notebook-drawing").locator("text")).toHaveCount(0);
  }
}

async function assertSavedEdits(page: Page) {
  const saved = (await storedNotes(page)).find((note) => note.id === originalNote.id)!;
  expect(saved.title).toBe(editedTitle);
  expect(saved.pages).toHaveLength(1);
  expect(saved.pages[0].staffCount).toBe(13);
  expect(saved.pages[0].strokes).toHaveLength(2);
  expect(saved.pages[0].strokes[0]).toEqual(originalNote.pages[0].strokes[0]);
  expect(saved.pages[0].strokes[1].points.length).toBeGreaterThan(1);
  expect(saved.pages[0].stamps).toHaveLength(2);
  expect(saved.pages[0].stamps![0]).toEqual(originalNote.pages[0].stamps![0]);
  expect(saved.pages[0].stamps![1]).toMatchObject({ glyph: "quarter", size: 26 });
  expect(saved.settings).toEqual({
    ...originalNote.settings, bpm: 113, follow: true, random: true, lineUnit: "phrase", playbackZoom: 0.75,
  });
  expect((await storedNotes(page)).find((note) => note.id === otherNote.id)).toEqual(otherNote);
  return saved;
}

for (const path of ["exit", "new", "open"] as const) {
  for (const choice of ["cancel", "discard", "save", "save failure"] as const) {
    test(`unsaved notebook ${path}: ${choice} protects ink, marks, rows and settings`, async ({ page }) => {
      const original = await openGuardReference(page);
      const editedPaper = await editGuardReference(page);
      if (choice === "save failure") {
        await page.evaluate((key) => {
          const setItem = Storage.prototype.setItem;
          const scope = window as typeof window & { restoreNotebookWrite?: () => void; failedNotebookWrites?: number };
          scope.failedNotebookWrites = 0;
          scope.restoreNotebookWrite = () => { Storage.prototype.setItem = setItem; };
          Storage.prototype.setItem = function (name, value) {
            if (name === key) {
              scope.failedNotebookWrites!++;
              throw new DOMException("Injected notebook write failure", "QuotaExceededError");
            }
            return setItem.call(this, name, value);
          };
        }, notebookKey);
      }
      await requestGuardAction(page, path);
      const index = choice === "cancel" ? 0 : choice === "discard" ? 1 : 2;
      await page.getByTestId(`web-alert-action-${index}`).click();
      if (choice === "cancel" || choice === "save failure") {
        if (choice === "save failure") {
          await expect.poll(() => page.evaluate(() => (window as typeof window & { failedNotebookWrites: number }).failedNotebookWrites)).toBe(1);
          await page.evaluate(() => (window as typeof window & { restoreNotebookWrite: () => void }).restoreNotebookWrite());
        }
        await expect(page.getByTestId("web-alert")).toHaveCount(0);
        expect(await storedRaw(page)).toBe(original.raw);
        await assertDraftIntact(page, editedPaper, path);
        if (choice === "save failure") {
          await expect(page.getByText("Injected notebook write failure", { exact: true })).toBeVisible();
        }
        // Retry the same action, proving the failed/cancelled draft remains dirty.
        await requestGuardAction(page, path);
        await page.getByTestId("web-alert-action-2").click();
        await assertDestination(page, path);
        await assertSavedEdits(page);
      } else if (choice === "discard") {
        await assertDestination(page, path);
        expect(await storedRaw(page)).toBe(original.raw);
        await openSaved(page, originalNote.title);
        await expect(titleInput(page)).toHaveValue(originalNote.title);
        await expect(page.getByTestId("notebook-bpm")).toHaveValue("84");
        expect(await paperContents(page)).toBe(original.paper);
      } else {
        await assertDestination(page, path);
        const saved = await assertSavedEdits(page);
        await openSaved(page, editedTitle);
        await expect(titleInput(page)).toHaveValue(editedTitle);
        expect(await paperContents(page)).toBe(editedPaper);
        // Round-trip through the actual load/save controls, not just localStorage.
        await page.getByTestId("notebook-save").click();
        await expect(page.getByTestId("web-alert")).toContainText(/Notebook saved|저장했습니다/);
        const reopened = (await storedNotes(page)).find((note) => note.id === originalNote.id)!;
        expect(reopened.pages).toEqual(saved.pages);
        expect(reopened.settings).toEqual(saved.settings);
      }
    });
  }
}

test("opening and dismissing the dial keeps an unsaved notebook intact without a save prompt", async ({ page }) => {
  const original = await openGuardReference(page);
  const editedPaper = await editGuardReference(page);
  await page.getByTestId("notebook-panel-close").click();
  await page.getByTestId("mode-cycle-label").click();
  await expect(page.getByTestId("mode-dial-fan")).toBeVisible();
  await expect(page.getByTestId("web-alert")).toHaveCount(0);
  await expect(page.getByTestId("notebook-drawing")).toBeVisible();
  await page.mouse.click(384, 900);
  await expect(page.getByTestId("mode-dial-fan")).toHaveCount(0);
  await expect(page.getByTestId("web-alert")).toHaveCount(0);
  expect(await paperContents(page)).toBe(editedPaper);
  expect(await storedRaw(page)).toBe(original.raw);
  await page.getByTestId("notebook-left-toggle").click();
  await expect(titleInput(page)).toHaveValue(editedTitle);
  await requestGuardAction(page, "new");
  await page.getByTestId("web-alert-action-2").click();
  await assertDestination(page, "new");
  await assertSavedEdits(page);
});

for (const change of ["ink", "mark", "rows", "settings"] as const) {
  test(`${change}-only changes are protected on every notebook departure path`, async ({ page }) => {
    const original = await openGuardReference(page);
    if (change === "settings") {
      await page.getByTestId("notebook-follow").click();
    } else {
      await page.getByTestId("notebook-panel-close").click();
      if (change === "ink") {
        const box = (await page.getByTestId("notebook-drawing").boundingBox())!;
        await page.mouse.move(box.x + 210, box.y + 110);
        await page.mouse.down();
        await page.mouse.move(box.x + 260, box.y + 125, { steps: 6 });
        await page.mouse.up();
      } else {
        await page.getByTestId("notebook-right-toggle").click();
        if (change === "mark") {
          await page.getByTestId("notebook-symbol-quarter").click();
          await page.getByTestId("notebook-stamp-confirm").click();
        } else {
          await page.getByText(/^Add staff$|^오선 추가$/).click();
          await page.getByTestId("notebook-panel-close").click();
        }
        if (change === "mark") {
          // The stamp action closes the drawer.
          await expect(page.getByTestId("notebook-panel-close")).toHaveCount(0);
        }
      }
      await page.getByTestId("notebook-left-toggle").click();
    }
    const draft = await paperContents(page);
    for (const path of ["new", "open", "exit"] as const) {
      await requestGuardAction(page, path);
      await page.getByTestId("web-alert-action-0").click();
      if (path === "exit") await page.getByTestId("notebook-left-toggle").click();
      await expect(titleInput(page)).toHaveValue(originalNote.title);
      expect(await paperContents(page)).toBe(draft);
      expect(await storedRaw(page)).toBe(original.raw);
    }
    // Persist after the cancellations to verify the individual edit survived.
    await page.getByTestId("notebook-save").click();
    await expect(page.getByTestId("web-alert")).toContainText(/Notebook saved|저장했습니다/);
    const saved = (await storedNotes(page)).find((note) => note.id === originalNote.id)!;
    if (change === "ink") expect(saved.pages[0].strokes).toHaveLength(2);
    if (change === "mark") expect(saved.pages[0].stamps).toHaveLength(2);
    if (change === "rows") expect(saved.pages[0].staffCount).toBe(13);
    if (change === "settings") expect(saved.settings).toEqual({ ...originalNote.settings, follow: true });
  });
}
