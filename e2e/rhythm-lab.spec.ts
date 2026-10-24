import { test, expect, type Page } from "@playwright/test";
import { createRhythmDocument, interpretRhythm } from "../lib/rhythm-lab/engine";

test.use({
  baseURL: process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : undefined,
});
test.setTimeout(90000);

async function enterLab(page: Page, entry: "rhythm" | "notebook") {
  await page.addInitScript(() => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
    localStorage.setItem("metronome_lab_unlocked", "true");
    localStorage.setItem("metronome_scores_v1", '["legacy-preserved"]');
    localStorage.setItem("metronome_score_legacy-preserved", '{"id":"legacy-preserved","marker":"do-not-change"}');
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("mode-cycle-label").waitFor({ timeout: 45000 });
  const skip = page.getByText(/건너뛰기|Skip/i).first();
  if (await skip.isVisible()) await skip.click();
  const viewport = page.viewportSize()!;
  await page.getByTestId("mode-cycle-label").click();
  await page.waitForTimeout(350);
  await page.mouse.click(viewport.width / 2 - 58, 86);
  await page.waitForTimeout(300);
  await page.mouse.click(viewport.width / 2, viewport.height * 0.7);
  await page.getByTestId("menu-lab").click();
  await page.getByTestId(entry === "rhythm" ? "menu-rhythm-lab" : "menu-staff-notebook").click();
  await expect(page.getByTestId(`lab-score-tab-${entry}`)).toBeVisible();
}

test("triplet recording renders grouped notation without tiny fabricated rests", async ({ page }) => {
  const doc = {
    ...createRhythmDocument({ title: "Triplet notation regression", bpm: 120 }),
    hits: [0, 500 / 6, 1000 / 6, 250, 2000 / 6, 2500 / 6]
      .map((onsetMs, index) => ({ id: `triplet-${index}`, onsetMs, drum: "snare" as const })),
  };
  await page.addInitScript((document) => {
    localStorage.setItem("rhythm_lab_documents_v1", JSON.stringify([document]));
  }, doc);
  await enterLab(page, "rhythm");
  await page.getByRole("button", { name: /^Open from Saved takes$|^저장 기록에서 열기$/ }).click();
  const notation = page.getByTestId("rhythm-staff");
  await notation.scrollIntoViewIfNeeded();
  await expect(notation.locator('svg text').filter({ hasText: /^3$/ })).toHaveCount(2);
  // Exact timing gives six equal sixteenth-triplets followed by three
  // quarter rests. These are rendered paths, not just model assertions.
  await expect(notation.locator('ellipse')).toHaveCount(6);
  await expect(notation.locator('path')).toHaveCount(3);
  const heads = await notation.locator('ellipse').evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("cx"))));
  for (let i = 2; i < heads.length; i++) expect(Math.abs((heads[i] - heads[i - 1]) - (heads[1] - heads[0]))).toBeLessThan(0.1);
  const renderedYs = await notation.locator('ellipse').evaluateAll((elements) => elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.y + bounds.height / 2;
  }));
  expect(Math.max(...renderedYs) - Math.min(...renderedYs)).toBeLessThan(0.5);
  const head = await notation.locator('ellipse').first().boundingBox();
  expect(head!.width).toBeGreaterThan(12);
  expect(head!.width).toBeLessThan(15);
  const engravingScale = await notation.locator('svg').evaluate((svg) => {
    const coordinates = svg.getAttribute("viewBox")!.split(" ").map(Number);
    return svg.getBoundingClientRect().width / coordinates[2];
  });
  expect(engravingScale).toBeCloseTo(0.8, 3);
  const target = await notation.getByTestId('rhythm-note-target-note-triplet-0').boundingBox();
  expect(target!.width).toBe(36);
  expect(target!.height).toBe(36);
  expect(Math.abs((target!.x + 18) - (head!.x + head!.width / 2))).toBeLessThan(0.5);
  expect(Math.abs((target!.y + 18) - (head!.y + head!.height / 2))).toBeLessThan(0.5);
  await page.screenshot({ path: "/tmp/rhythm-notation-triplets-phone.png" });
});

test("notation similarity and intent confirmation persist separately", async ({ page }) => {
  const doc = {
    ...createRhythmDocument({ title: "Similarity review", bpm: 120 }),
    hits: [12, 508, 997, 1515].map((onsetMs, index) => ({ id: `review-${index}`, onsetMs, drum: "snare" as const })),
  };
  await page.addInitScript((document) => {
    localStorage.setItem("rhythm_lab_documents_v1", JSON.stringify([document]));
  }, doc);
  await enterLab(page, "rhythm");
  await page.getByRole("button", { name: /^Open from Saved takes$|^저장 기록에서 열기$/ }).click();
  const panel = page.getByTestId("rhythm-validation-panel");
  await expect(page.getByTestId("rhythm-similarity")).toHaveText("91%");
  await panel.getByTestId("rhythm-review-region-0").click();
  await panel.getByRole("button", { name: /^Overlay$|^겹쳐 듣기$/ }).click();
  await panel.getByTestId("rhythm-review-confirm").click();
  await expect(panel.getByTestId("rhythm-review-region-0")).toContainText(/Confirmed|확정됨/);
  await expect(page.getByTestId("rhythm-similarity")).toHaveText("91%");
  await page.getByTestId("rhythm-save").click();
  await expect.poll(() => page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("practice_book") ?? "[]").filter((entry: { mode: string }) => entry.mode === "rhythm").map((entry: { rhythmDocument: unknown }) => entry.rhythmDocument);
    return stored[0]?.reviewConfirmations?.length ?? 0;
  })).toBe(1);
  const storedHits = await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book")!).find((entry: { mode: string }) => entry.mode === "rhythm").rhythmDocument.hits);
  expect(storedHits).toEqual(doc.hits);
  const okay = page.getByText(/^OK$|^확인$/).last();
  if (await okay.isVisible()) await okay.click();
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/rhythm-verification-panel.png" });
});

test("a structural calculation failure cannot be approved by the user", async ({ page }) => {
  const doc = {
    ...createRhythmDocument({ title: "Invalid glyph regression", bpm: 120 }),
    hits: [0, 500].map((onsetMs, index) => ({ id: `invalid-${index}`, onsetMs, drum: "snare" as const })),
  };
  const first = interpretRhythm(doc).events[0];
  const invalid = { ...doc, manualEvents: [{ ...first, value: 8, locked: true }] };
  await page.addInitScript((document) => {
    localStorage.setItem("rhythm_lab_documents_v1", JSON.stringify([document]));
  }, invalid);
  await enterLab(page, "rhythm");
  await page.getByRole("button", { name: /^Open from Saved takes$|^저장 기록에서 열기$/ }).click();
  const panel = page.getByTestId("rhythm-validation-panel");
  await expect(page.getByTestId("rhythm-similarity")).toHaveText("—");
  await panel.getByTestId("rhythm-review-region-0").click();
  await expect(panel).toContainText(/calculation failed|계산 검증에 실패/);
  await expect(panel.getByTestId("rhythm-review-confirm")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /^Notation$|^기보$/ })).toBeDisabled();
  await expect(panel.getByRole("button", { name: /^Original$|^원본$/ })).toBeEnabled();
});

test("staff notebook really draws, saves, restores, and does not alter legacy scores", async ({ page }) => {
  await enterLab(page, "notebook");
  const paper = page.getByTestId("notebook-drawing");
  await paper.scrollIntoViewIfNeeded();
  const box = await paper.boundingBox();
  if (!box) throw new Error("Missing paper bounds");
  const x = box.x + box.width * 0.25, y = box.y + box.height * 0.2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y - 10, { steps: 6 });
  await page.mouse.move(x + 50, y + 15, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId("notebook-save").click();
  await expect.poll(() => page.evaluate(() => {
    const notes = JSON.parse(localStorage.getItem("lab_staff_notebooks_v1") ?? "[]");
    return notes[0]?.pages[0]?.strokes?.length ?? 0;
  })).toBe(1);
  const ink = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0].pages[0].strokes[0]);
  expect(ink.points.length).toBeGreaterThan(2);
  expect(await page.evaluate(() => localStorage.getItem("metronome_scores_v1"))).toBe('["legacy-preserved"]');
  const okay = page.getByText(/^OK$|^확인$/).last();
  if (await okay.isVisible()) await okay.click();
  await page.screenshot({ path: "/tmp/rhythm-lab-notebook-phone.png" });
});

test("rhythm capture persists actual input and permits switching to the independent notebook", async ({ page }) => {
  await enterLab(page, "rhythm");
  await expect(page.getByTestId("rhythm-input-stage")).toBeVisible();
  await expect(page.getByTestId("rhythm-review-stage")).toHaveCount(0);
  await page.getByTestId("rhythm-record").click();
  await expect(page.getByTestId("rhythm-record-status")).toHaveText(/Recording|녹음 중/, { timeout: 6000 });
  for (let i = 0; i < 4; i++) {
    await page.getByTestId("rhythm-pad").tap();
    await page.waitForTimeout(120);
  }
  await expect(page.getByText(/^4 hits?$|^4 타격s?$/)).toBeVisible();
  await page.getByTestId("rhythm-record").click();
  await expect(page.getByTestId("rhythm-review-stage")).toBeVisible();
  await expect(page.getByTestId("rhythm-input-stage")).toHaveCount(0);
  await expect(page.getByTestId("rhythm-pad")).toHaveCount(0);
  const staff = await page.getByTestId("rhythm-staff").boundingBox();
  const validation = await page.getByTestId("rhythm-validation-panel").boundingBox();
  expect(staff!.y).toBeLessThan(validation!.y);
  await page.getByTestId("rhythm-save").click();
  await expect.poll(() => page.evaluate(() => {
    const documents = JSON.parse(localStorage.getItem("practice_book") ?? "[]").filter((entry: { mode: string }) => entry.mode === "rhythm").map((entry: { rhythmDocument: unknown }) => entry.rhythmDocument);
    return documents[0]?.hits.length ?? 0;
  })).toBe(4);
  const okay = page.getByText(/^OK$|^확인$/).last();
  if (await okay.isVisible()) await okay.click();
  await page.screenshot({ path: "/tmp/rhythm-lab-capture-phone.png" });
  await page.getByTestId("lab-score-tab-notebook").click();
  await expect(page.getByTestId("notebook-drawing")).toBeAttached();
  await page.getByTestId("lab-score-tab-rhythm").click();
  await expect(page.getByTestId("rhythm-save")).toBeAttached();
});

test("desktop keyboard records a held chord with independent key releases", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await enterLab(page, "rhythm");
  await page.getByText(/^Keys$|^건반$/).click();
  await page.getByRole("switch").click();
  await page.getByTestId("rhythm-record").click();
  await expect(page.getByTestId("rhythm-record-status")).toHaveText(/Recording|녹음 중/);
  await page.getByTestId("rhythm-keyboard").focus();
  await page.keyboard.down("a");
  await page.keyboard.down("d");
  await page.keyboard.down("g");
  await page.waitForTimeout(210);
  await page.keyboard.up("a");
  await page.waitForTimeout(100);
  await page.keyboard.up("d");
  await page.keyboard.up("g");
  await page.getByTestId("rhythm-record").click();
  await page.getByTestId("rhythm-save").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]").find((entry: { mode: string }) => entry.mode === "rhythm")?.rhythmDocument.hits.length)).toBe(3);
  const hits = await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book")!).find((entry: { mode: string }) => entry.mode === "rhythm").rhythmDocument.hits);
  expect(hits.map((hit: { midi: number }) => hit.midi)).toEqual([60, 64, 67]);
  expect(hits.every((hit: { onsetMs: number; releaseMs: number }) => hit.releaseMs - hit.onsetMs >= 180)).toBe(true);
  const okay = page.getByText(/^OK$|^확인$/).last();
  if (await okay.isVisible()) await okay.click();
  await page.screenshot({ path: "/tmp/rhythm-lab-desktop.png" });
});

test("main practice book opens a full rhythm for correction, saving and practice", async ({ page }) => {
  const doc = {
    ...createRhythmDocument({ title: "Main book rhythm", bpm: 120 }),
    hits: [0, 500, 1000, 1500].map((onsetMs, index) => ({ id: `main-${index}`, onsetMs, drum: "snare" as const })),
  };
  await page.addInitScript((document) => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
    localStorage.setItem("practice_book", JSON.stringify([{
      id: `rhythm:${document.id}`, label: document.title, createdAt: document.createdAt,
      mode: "rhythm", bpm: document.bpm, beatsPerMeasure: 4,
      beatTypes: ["normal", "normal", "normal", "normal"], beatSubdivisions: {},
      barRepeats: {}, barLoopMode: "once", subdivisionPattern: [], rhythmDocument: document,
    }]));
  }, doc);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 45_000 });
  const viewport = page.viewportSize()!;
  await page.getByTestId("mode-cycle-label").click();
  await page.waitForTimeout(400);
  await page.mouse.click(viewport.width / 2 - 96, 39);
  await page.waitForTimeout(300);
  await page.mouse.click(viewport.width / 2, viewport.height * 0.7);
  await expect(page.getByTestId("practice-book-screen")).toBeVisible();
  await page.getByText("Main book rhythm", { exact: true }).click();
  await expect(page.getByTestId("rhythm-review-stage")).toBeVisible();
  await expect(page.getByTestId("rhythm-pad")).toHaveCount(0);
  await expect(page.getByTestId("rhythm-record")).toHaveCount(0);
  await expect(page.getByTestId("rhythm-staff")).toBeVisible();
  const save = page.getByTestId("rhythm-save");
  const saveBox = (await save.boundingBox())!;
  expect(saveBox.x).toBeGreaterThanOrEqual(0);
  expect(saveBox.x + saveBox.width).toBeLessThanOrEqual(viewport.width);
  await save.click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]").length)).toBe(1);
  const okay = page.getByText(/^OK$|^확인$/).last();
  if (await okay.isVisible()) await okay.click();
  await page.screenshot({ path: "/tmp/rhythm-main-book-review.png" });
  await page.getByTestId("rhythm-flow-practice").click();
  await expect(page.getByTestId("rhythm-practice-stage")).toBeVisible();
  await expect(page.getByTestId("rhythm-validation-panel")).toHaveCount(0);
  await expect(page.getByTestId("rhythm-pad")).toBeVisible();
  await page.getByRole("switch").click();
  await page.getByText(/^Start practice$|^연습 시작$/).click();
  await expect(page.getByTestId("rhythm-flow-review")).toBeDisabled();
  await page.getByTestId("rhythm-pad").tap();
  await expect(page.getByText(/Overall score:|종합 점수:/)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("rhythm-flow-review").click();
  await expect(page.getByTestId("rhythm-review-stage")).toBeVisible();
  await expect(page.getByTestId("rhythm-pad")).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book")!)[0].rhythmDocument.hits)).toEqual(doc.hits);
  await page.getByRole("button", { name: /^Close$|^닫기$/ }).click();
  await page.getByText(/^Close$|^닫기$/).last().click();
  await expect(page.getByTestId("practice-book-screen")).toBeVisible();
  await expect(page.getByText("Main book rhythm", { exact: true })).toBeVisible();
});

test("manual notation can be saved and practised without fabricating raw hits", async ({ page }) => {
  await enterLab(page, "rhythm");
  await page.getByTestId("rhythm-flow-review").click();
  await page.getByTestId("rhythm-insert-note").click();
  await expect(page.getByTestId("rhythm-staff").locator("ellipse")).toHaveCount(1);
  await page.getByTestId("rhythm-save").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]").find((entry: { mode: string }) => entry.mode === "rhythm")?.rhythmDocument.manualEvents?.filter((event: { kind: string }) => event.kind === "note").length)).toBe(1);
  const okay = page.getByText(/^OK$|^확인$/).last();
  if (await okay.isVisible()) await okay.click();
  await page.getByTestId("rhythm-flow-practice").click();
  await page.getByRole("switch").click();
  await page.getByText(/^Start practice$|^연습 시작$/).click();
  await expect(page.getByText(/Overall score:|종합 점수:/)).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book")!)[0].rhythmDocument.hits)).toEqual([]);
});
