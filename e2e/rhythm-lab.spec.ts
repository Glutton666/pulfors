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

async function openSavedTake(page: Page) {
  await page.getByTestId("rhythm-load").click();
  await page.locator('[data-testid^="rhythm-saved-open-"]').first().click();
}

async function disableCountIn(page: Page, flow: "input" | "practice" = "input") {
  await page.getByTestId(flow === "input" ? "rhythm-settings" : "rhythm-settings-practice").click();
  await page.getByTestId("rhythm-count-in").click();
  await page.getByTestId("rhythm-settings-close").click();
  await expect(page.getByTestId("rhythm-settings-modal")).toHaveCount(0);
}

test("mixed binary and triplet notes retain local brackets on the visible staff", async ({ page }) => {
  const doc = { ...createRhythmDocument({ title: "Mixed local groups", bpm: 120 }),
    hits: [0, 125, 250, 1000 / 3, 1250 / 3].map((onsetMs, i) =>
      ({ id: `mixed-${i}`, onsetMs, drum: "snare" as const })) };
  await page.addInitScript((document) => localStorage.setItem("rhythm_lab_documents_v1", JSON.stringify([document])), doc);
  await enterLab(page, "rhythm");
  await openSavedTake(page);
  const staff = page.getByTestId("rhythm-staff");
  await staff.scrollIntoViewIfNeeded();
  await expect(staff.locator("ellipse")).toHaveCount(5);
  await expect(staff.locator("svg text").filter({ hasText: /^3$/ })).toHaveCount(1);
  await page.getByTestId("rhythm-tool-validation").click();
  await expect(page.getByTestId("rhythm-similarity")).toHaveText("100%");
  await page.screenshot({ path: "/tmp/rhythm-mixed-local-groups.png" });
});

test("long polyphonic gates render ties and permit independent connected-note editing", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const doc = { ...createRhythmDocument({ title: "Independent tied gates", bpm: 120 }),
    hits: [{ id: "long", midi: 60, onsetMs: 1750, releaseMs: 5750 },
      { id: "short", midi: 64, onsetMs: 2000, releaseMs: 2500 }] };
  await page.addInitScript((document) => localStorage.setItem("rhythm_lab_documents_v1", JSON.stringify([document])), doc);
  await enterLab(page, "rhythm");
  await openSavedTake(page);
  const staff = page.getByTestId("rhythm-staff");
  await staff.scrollIntoViewIfNeeded();
  expect(await staff.locator('path[stroke-width="1.3"]').count()).toBeGreaterThanOrEqual(3);
  await expect(staff.locator("ellipse")).toHaveCount(5);
  // C4 needs one ledger per fragment, including after the wrapped row.
  expect(await staff.locator("line").evaluateAll((lines) => lines.filter((line) =>
    Math.abs(Number(line.getAttribute("x2")) - Number(line.getAttribute("x1")) - 20) < 0.01).length)).toBe(4);
  await page.getByTestId("rhythm-tool-validation").click();
  await expect(page.getByTestId("rhythm-validation-panel")).toContainText(/key duration|건반 음 길이/i);
  await page.getByTestId("rhythm-tool-edit").click();
  await page.getByTestId("rhythm-note-target-note-long").click();
  await expect(page.locator('input[value="8"]')).toHaveCount(1);
  await page.screenshot({ path: "/tmp/rhythm-polyphonic-ties-desktop.png" });
  await page.locator('input[value="8"]').fill("4");
  await page.getByText(/^Apply$|^적용$/).first().click();
  await page.getByTestId("rhythm-save").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]")
    .find((entry: { mode: string }) => entry.mode === "rhythm")?.rhythmDocument.notationVersion)).toBe(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book")!)[0].rhythmDocument.hits)).toEqual(doc.hits);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book")!)[0].rhythmDocument.manualEvents
    .filter((event: { hitIds: string[] }) => event.hitIds.includes("long"))
    .reduce((sum: number, event: { durationQ: { n: number; d: number } }) => sum + event.durationQ.n / event.durationQ.d, 0))).toBe(4);
});

test("legacy scores change notation only after explicit opt-in and keep original timestamps", async ({ page }) => {
  const doc = { ...createRhythmDocument({ title: "Legacy notation choice", bpm: 120 }), notationVersion: undefined,
    hits: [0, 500, 1000, 1500].map((onsetMs, i) => ({ id: `old-${i}`, onsetMs, drum: "snare" as const })) };
  await page.addInitScript((document) => localStorage.setItem("rhythm_lab_documents_v1", JSON.stringify([document])), doc);
  await enterLab(page, "rhythm");
  await openSavedTake(page);
  const staff = page.getByTestId("rhythm-staff");
  await expect(staff.locator("ellipse")).toHaveCount(4);
  await expect(staff.locator("path")).toHaveCount(0);
  await page.getByTestId("rhythm-upgrade-notation").click();
  await expect(page.getByTestId("rhythm-upgrade-notation")).toHaveCount(0);
  // Four dotted-eighth rests plus two flag paths per un-beamed sixteenth.
  await expect(staff.locator("path")).toHaveCount(12);
  await expect(staff.locator("circle")).toHaveCount(4);
  await page.getByTestId("rhythm-save").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]")[0]?.rhythmDocument.notationVersion)).toBe(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book")!)[0].rhythmDocument.hits)).toEqual(doc.hits);
});

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
  await openSavedTake(page);
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
  await openSavedTake(page);
  await page.getByTestId("rhythm-tool-validation").click();
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
  await openSavedTake(page);
  await page.getByTestId("rhythm-tool-validation").click();
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
  await page.getByTestId("rhythm-tool-validation").click();
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
  await page.getByTestId("rhythm-keyboard").focus();
  await expect(page.getByTestId("rhythm-keyboard")).toBeFocused();
  await page.keyboard.down("a");
  await page.keyboard.down("d");
  await page.keyboard.down("g");
  await expect(page.getByTestId("rhythm-record-status")).toHaveText(/Recording|녹음 중/);
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
  expect(hits[0].onsetMs).toBe(0);
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
  await disableCountIn(page, "practice");
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
  await page.getByTestId("rhythm-tool-edit").click();
  await page.getByTestId("rhythm-insert-note").click();
  await expect(page.getByTestId("rhythm-staff").locator("ellipse")).toHaveCount(1);
  await page.getByTestId("rhythm-save").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]").find((entry: { mode: string }) => entry.mode === "rhythm")?.rhythmDocument.manualEvents?.filter((event: { kind: string }) => event.kind === "note").length)).toBe(1);
  const okay = page.getByText(/^OK$|^확인$/).last();
  if (await okay.isVisible()) await okay.click();
  await page.getByTestId("rhythm-flow-practice").click();
  await disableCountIn(page, "practice");
  await page.getByText(/^Start practice$|^연습 시작$/).click();
  await expect(page.getByText(/Overall score:|종합 점수:/)).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book")!)[0].rhythmDocument.hits)).toEqual([]);
});

test("capture settings and practice book popups preserve the full real take", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await enterLab(page, "rhythm");
  await expect(page.getByText("Play it first. Notate it later.", { exact: true })).toHaveCount(0);
  await page.getByTestId("rhythm-settings").click();
  await page.getByTestId("rhythm-title-input").fill("Live interval take");
  await page.getByTestId("rhythm-bpm-input").fill("120");
  await page.getByTestId("rhythm-count-in").click();
  await page.getByTestId("rhythm-settings-close").click();
  await expect(page.getByTestId("rhythm-settings-modal")).toHaveCount(0);
  await page.getByTestId("rhythm-record").click();
  await expect(page.getByTestId("rhythm-record-status")).toHaveText(/Recording|녹음 중/);
  await expect(page.getByTestId("rhythm-settings")).toBeDisabled();
  await expect(page.getByTestId("rhythm-load")).toBeDisabled();
  const pad = page.getByTestId("rhythm-pad");
  await pad.tap();
  await page.waitForTimeout(250);
  await pad.tap();
  await page.waitForTimeout(500);
  await pad.tap();
  await expect(page.getByTestId("rhythm-interval-3")).toBeVisible();
  await expect(page.getByTestId("rhythm-live-verification")).not.toContainText(/Invalid notation|기보 구조 오류/);
  const rawInterval = Number((await page.getByTestId("rhythm-live-interval").innerText()).replace(/[^\d]/g, ""));
  expect(rawInterval).toBeGreaterThan(450);
  expect(rawInterval).toBeLessThan(850);
  await expect(page.getByTestId("rhythm-staff").locator("ellipse")).toHaveCount(3);
  await page.screenshot({ path: "/tmp/rhythm-live-recording.png" });
  await page.getByTestId("rhythm-record").click();
  await page.getByTestId("rhythm-save").click();
  const okay = page.getByText(/^OK$|^확인$/).last();
  await okay.click();
  const document = await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book")!).find((entry: { mode: string }) => entry.mode === "rhythm").rhythmDocument);
  expect(document.hits).toHaveLength(3);
  expect(document.hits.every((hit: { onsetMs: number; releaseMs: number }) => hit.releaseMs >= hit.onsetMs)).toBe(true);
  const intervals = document.hits.slice(1).map((hit: { onsetMs: number }, index: number) => hit.onsetMs - document.hits[index].onsetMs);
  expect(Math.abs(intervals.at(-1) - rawInterval)).toBeLessThanOrEqual(1);
  const values = interpretRhythm(document).events.filter((event) => event.kind === "note").map((event) => event.durationQ.n / event.durationQ.d);
  expect(values[1]).toBeGreaterThan(values[0]);
  await page.getByTestId("rhythm-library-open-review").click();
  await page.getByTestId(`rhythm-saved-open-${document.id}`).click();
  await expect(page.getByTestId("rhythm-review-stage")).toBeVisible();
  await page.getByTestId("rhythm-library-open-review").click();
  await page.getByTestId(`rhythm-saved-delete-${document.id}`).click();
  await page.getByText(/^Delete$|^삭제$/).last().click();
  await expect(page.getByTestId(`rhythm-saved-${document.id}`)).toHaveCount(0);
  const entries = await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]"));
  expect(entries.filter((entry: { mode: string }) => entry.mode === "rhythm")).toHaveLength(0);
  await page.getByTestId("rhythm-library-close").click();
});

for (const viewport of [{ width: 375, height: 667 }, { width: 740, height: 375 }]) {
  test(`essential live capture fits one screen at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await enterLab(page, "rhythm");
    const scroll = page.getByTestId("rhythm-workspace-scroll");
    const dock = page.getByTestId("rhythm-input-dock");
    const pad = page.getByTestId("rhythm-pad");
    const initial = (await pad.boundingBox())!;
    expect(initial.y).toBeGreaterThan(0);
    expect(initial.y + initial.height).toBeLessThanOrEqual(viewport.height);
    expect(await pad.evaluate((element) => !!element.closest('[data-testid="rhythm-workspace-scroll"]'))).toBe(false);
    const scrollBounds = (await scroll.boundingBox())!;
    await page.screenshot({ path: `/tmp/rhythm-layout-${viewport.width}.png` });
    for (const id of ["rhythm-settings", "rhythm-load", "rhythm-record", "rhythm-record-status", "rhythm-live-interval", "rhythm-live-verification", "rhythm-staff"]) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${id} must fit vertically`).toBeLessThanOrEqual(viewport.height);
      if (id === "rhythm-staff" || id === "rhythm-settings" || id === "rhythm-live-verification") {
        expect(box.y).toBeGreaterThanOrEqual(scrollBounds.y);
        expect(box.y + box.height, `${id} must not be clipped by dock`).toBeLessThanOrEqual(scrollBounds.y + scrollBounds.height);
      }
    }
    await page.screenshot({ path: `/tmp/rhythm-fixed-input-${viewport.width}.png` });
    await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const afterScroll = (await pad.boundingBox())!;
    expect(afterScroll.y).toBeCloseTo(initial.y, 1);
    expect(afterScroll.height).toBeCloseTo(initial.height, 1);

    // Scrolling above the pad must not disable actual recording or move its
    // strike target. A held vertical drag must retain one down/up pair.
    await disableCountIn(page);
    await page.getByTestId("rhythm-record").click();
    await expect(page.getByTestId("rhythm-record-status")).toHaveText(/Recording|녹음 중/);
    await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await pad.tap();
    await page.waitForTimeout(150);
    await pad.tap();
    await expect(page.getByTestId("rhythm-live-interval")).not.toHaveText(/—/);
    await expect(page.getByTestId("rhythm-interval-2")).toBeVisible({ visible: viewport.height > 500 });
    const target = (await pad.boundingBox())!;
    const touch = await page.context().newCDPSession(page);
    const x = target.x + target.width / 2;
    const y = target.y + target.height * 0.7;
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - 35 }] });
    await page.waitForTimeout(160);
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.detach();
    expect((await pad.boundingBox())!.y).toBeCloseTo(initial.y, 1);
    await page.getByTestId("rhythm-record").click();
    await expect(dock).toHaveCount(0);
    await page.getByTestId("rhythm-save").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]").find((entry: { mode: string }) => entry.mode === "rhythm")?.rhythmDocument.hits.length)).toBe(3);
    const hits = await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book")!)[0].rhythmDocument.hits);
    expect(hits.every((hit: { onsetMs: number; releaseMs: number }) => hit.releaseMs >= hit.onsetMs)).toBe(true);
    expect(hits[2].releaseMs - hits[2].onsetMs).toBeGreaterThanOrEqual(140);
    const okay = page.getByText(/^OK$|^확인$/).last();
    if (await okay.isVisible()) await okay.click();

    await page.getByTestId("rhythm-flow-practice").click();
    await expect(dock).toBeVisible();
    const practicePad = (await pad.boundingBox())!;
    await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect((await pad.boundingBox())!.y).toBeCloseTo(practicePad.y, 1);
    expect(practicePad.y + practicePad.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: `/tmp/rhythm-fixed-practice-${viewport.width}.png` });
    await page.getByTestId("rhythm-flow-input").click();
    await page.getByText(/^Keys$|^건반$/).click();
    const keyboard = page.getByTestId("rhythm-keyboard");
    const keysBefore = (await keyboard.boundingBox())!;
    expect(keysBefore.y + keysBefore.height).toBeLessThanOrEqual(viewport.height);
    expect(await keyboard.evaluate((element) => !!element.closest('[data-testid="rhythm-workspace-scroll"]'))).toBe(false);
    await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect((await keyboard.boundingBox())!.y).toBeCloseTo(keysBefore.y, 1);
  });
}

for (const viewport of [{ width: 375, height: 667 }, { width: 740, height: 375 }]) {
  test(`first tap records and preserves direct notation for restoration at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      (window as any).__rhythmSounds = 0;
      for (const prototype of [AudioBufferSourceNode.prototype, OscillatorNode.prototype]) {
        const original = prototype.start;
        prototype.start = function (...args: any[]) {
          (window as any).__rhythmSounds++;
          return original.apply(this, args as [number]);
        };
      }
    });
    await enterLab(page, "rhythm");
    const pad = page.getByTestId("rhythm-pad");
    const before = (await pad.boundingBox())!;
    const guidance = page.getByTestId("rhythm-input-guidance");
    await expect(guidance).toContainText(/First tap records immediately|첫 탭부터 즉시 기록/);
    await page.getByTestId("rhythm-entry-notation").click();
    await expect(guidance).toContainText(/timing is not recorded|누른 타이밍은 기록되지 않음/);
    await page.getByTestId("rhythm-entry-value-8").click();
    const audioBefore = await page.evaluate(() => (window as any).__rhythmSounds);
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await expect(pad).toHaveAttribute("aria-pressed", "true");
    await page.mouse.up();
    await expect(pad).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => page.evaluate(() => (window as any).__rhythmSounds)).toBeGreaterThan(audioBefore);
    await expect(page.getByTestId("rhythm-staff").locator("ellipse")).toHaveCount(1);
    await expect(page.getByTestId("rhythm-record-status")).toHaveText(/Stopped|정지/);
    expect((await pad.boundingBox())!.y).toBeCloseTo(before.y, 1);
    expect((await pad.boundingBox())!.height).toBeCloseTo(before.height, 1);
    expect((await pad.boundingBox())!.y).toBeCloseTo(before.y, 1);

    await page.getByTestId("rhythm-record").click();
    await page.getByRole("button", { name: /^Cancel$|^취소$/ }).click();
    await expect(page.getByTestId("rhythm-record")).toContainText(/Switch to tap capture|탭 기록으로 전환/);
    await expect(page.getByTestId("rhythm-staff").locator("ellipse")).toHaveCount(1);
    const guidanceBox = (await guidance.boundingBox())!;
    expect(guidanceBox.y + guidanceBox.height).toBeLessThanOrEqual(viewport.height);
    const staff = (await page.getByTestId("rhythm-staff").boundingBox())!;
    const scroll = (await page.getByTestId("rhythm-workspace-scroll").boundingBox())!;
    expect(staff.y + staff.height).toBeLessThanOrEqual(scroll.y + scroll.height);
    await page.screenshot({ path: `/tmp/rhythm-entry-modes-${viewport.width}.png` });
    await page.getByTestId("rhythm-entry-capture").click();
    await pad.tap();
    await expect(page.getByTestId("rhythm-record-status")).toHaveText(/Recording|녹음 중/);
    await expect(page.getByTestId("rhythm-staff").locator("ellipse")).toHaveCount(1);
    await page.waitForTimeout(150);
    await pad.tap();
    expect((await pad.boundingBox())!.y).toBeCloseTo(before.y, 1);
    await page.screenshot({ path: `/tmp/rhythm-first-tap-${viewport.width}.png` });
    await page.getByTestId("rhythm-record").click();
    await page.getByTestId("rhythm-save").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]")
      .find((entry: any) => entry.mode === "rhythm")?.rhythmDocument.hits.length)).toBe(2);
    const captured = await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book")!)[0].rhythmDocument);
    expect(captured.hits[0].onsetMs).toBe(0);
    expect(captured.hits.every((hit: any) => hit.releaseMs >= hit.onsetMs)).toBe(true);
    await page.getByText(/^OK$|^확인$/).last().click();
    await page.getByTestId("rhythm-recovery-restore").click();
    await page.getByTestId("rhythm-save").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]")
      .find((entry: any) => entry.rhythmDocument?.hits.length === 0)?.rhythmDocument.manualEvents?.length)).toBe(1);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book")!).find((entry: any) => entry.rhythmDocument?.hits.length === 0).rhythmDocument);
    expect(saved.hits).toEqual([]);
    expect(saved.manualEvents[0].durationQ).toEqual({ n: 1, d: 2 });
    await page.getByText(/^OK$|^확인$/).last().click();
    await page.getByTestId("rhythm-recovery-restore").click();
    await page.getByTestId("rhythm-save").click();
    await expect.poll(() => page.evaluate((id) => JSON.parse(localStorage.getItem("practice_book") ?? "[]")
      .find((entry: any) => entry.rhythmDocument?.id === id)?.rhythmDocument.hits.length, captured.id)).toBe(2);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("rhythm_lab_recovery_v1") ?? "{}").documents?.length ?? 0)).toBe(2);
    if (viewport.width === 375) {
      await page.getByText(/^OK$|^확인$/).last().click();
      await enterLab(page, "rhythm");
      await expect(page.getByTestId("rhythm-recovery-next")).toBeVisible();
      // The last checkpoint may be B; select A explicitly through the same
      // visible recovery picker a user uses, rather than assuming its order.
      if (!/0 (hits?|타격)/.test(await page.getByTestId("rhythm-recovery-restore").innerText())) {
        await page.getByTestId("rhythm-recovery-next").click();
      }
      await expect(page.getByTestId("rhythm-recovery-restore")).toContainText(/0 (hits?|타격)/);
      await page.screenshot({ path: "/tmp/rhythm-recovery-reopened.png" });
      await page.getByTestId("rhythm-recovery-restore").click();
      await page.getByTestId("rhythm-save").click();
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]")[0]?.rhythmDocument.hits.length)).toBe(0);
      await page.getByText(/^OK$|^확인$/).last().click();
      await page.getByTestId("rhythm-recovery-restore").click();
      await page.getByTestId("rhythm-save").click();
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]")[0]?.rhythmDocument.hits.length)).toBe(2);
    }
  });
}

test("a saved direct-entry choice keeps its timing warning on revisit; count-in does not collect preview taps", async ({ page }) => {
  await enterLab(page, "rhythm");
  await page.getByTestId("rhythm-entry-notation").click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("rhythm_lab_entry_mode_v1"))).toBe("notation");
  await enterLab(page, "rhythm");
  await expect(page.getByTestId("rhythm-input-guidance")).toContainText(/timing is not recorded|누른 타이밍은 기록되지 않음/);
  await page.getByTestId("rhythm-record").click();
  await expect(page.getByTestId("rhythm-record-status")).toHaveText(/Count-in|예비박/);
  await expect(page.getByTestId("rhythm-entry-notation")).toBeDisabled();
  await expect(page.getByTestId("rhythm-input-guidance")).toContainText(/no hits captured|타격은 기록되지 않음/);
  await page.getByTestId("rhythm-pad").tap();
  await expect(page.getByTestId("rhythm-staff").locator("ellipse")).toHaveCount(0);
  await expect(page.getByTestId("rhythm-record-status")).toHaveText(/Recording|녹음 중/, { timeout: 6000 });
  await page.getByTestId("rhythm-pad").tap();
  await page.getByTestId("rhythm-record").click();
  await page.getByTestId("rhythm-save").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]")
    .find((entry: any) => entry.mode === "rhythm")?.rhythmDocument.hits.length)).toBe(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book")!).find((entry: any) => entry.mode === "rhythm").rhythmDocument);
  expect(saved.hits[0].releaseMs).toBeGreaterThanOrEqual(saved.hits[0].onsetMs);
  expect(await page.evaluate(() => localStorage.getItem("rhythm_lab_entry_mode_v1"))).toBe("capture");
});

for (const viewport of [{ width: 375, height: 667 }, { width: 740, height: 375 }]) {
  test(`Korean drum controls and nearby guidance stay separate at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem("metronome_language", "ko"));
    await enterLab(page, "rhythm");
    await page.getByTestId("rhythm-entry-notation").click();
    await page.getByRole("button", { name: "드럼", exact: true }).click();
    await page.getByRole("button", { name: "kick", exact: true }).click();
    const mode = (await page.getByTestId("rhythm-entry-notation").boundingBox())!;
    const settings = (await page.getByTestId("rhythm-settings").boundingBox())!;
    expect(mode.x + mode.width).toBeLessThanOrEqual(settings.x);
    await expect(page.getByTestId("rhythm-input-guidance")).toContainText("누른 타이밍은 기록되지 않음");
    for (const id of ["rhythm-record", "rhythm-input-guidance", "rhythm-entry-current-value", "rhythm-pad"]) {
      const bounds = (await page.getByTestId(id).boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    }
    await page.getByTestId("rhythm-record").click();
    await expect(page.getByTestId("rhythm-input-guidance")).toContainText("모드 전환 잠김");
    const guide = (await page.getByTestId("rhythm-input-guidance").boundingBox())!;
    const pad = (await page.getByTestId("rhythm-pad").boundingBox())!;
    if (viewport.width > viewport.height) expect(guide.x + guide.width).toBeLessThanOrEqual(pad.x);
    else expect(guide.y + guide.height).toBeLessThanOrEqual(pad.y);
    await page.screenshot({ path: `/tmp/rhythm-entry-korean-${viewport.width}.png` });
  });
}
