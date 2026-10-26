import { expect, test, type Page } from "@playwright/test";
import { createRhythmDocument } from "../lib/rhythm-lab/engine";

test.use({ baseURL: process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : undefined });
test.setTimeout(90000);
async function enter(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
    localStorage.setItem("metronome_lab_unlocked", "true");
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
  await page.getByTestId("menu-rhythm-lab").click();
  await expect(page.getByTestId("rhythm-input-stage")).toBeVisible();
}
async function hold(page: Page, x: number, y: number, ms = 700) {
  await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up();
}

test("bounded reinterpretation is explicit, reversible and preserved on save/reopen", async ({ page }) => {
  const doc = { ...createRhythmDocument({ title: "Timing correction", bpm: 120 }), automaticCorrection: undefined,
    hits: [18, 268, 518, 768].map((onsetMs, i) => ({ id: `jitter-${i}`, onsetMs, releaseMs: onsetMs + 30, drum: "snare" as const })) };
  await page.addInitScript((doc) => localStorage.setItem("rhythm_lab_documents_v1", JSON.stringify([doc])), doc);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.getByTestId("rhythm-load").click();
  await page.getByTestId(`rhythm-saved-open-${doc.id}`).click();
  const upgrade = page.getByTestId("rhythm-upgrade-notation");
  await expect(upgrade).toBeVisible();
  const rests = page.locator('[data-testid^="rhythm-rest-glyph-"]');
  const oldCount = await rests.count();
  await upgrade.click();
  await expect.poll(() => rests.count()).toBeLessThan(oldCount);
  await page.getByTestId("rhythm-restore-notation").click();
  await expect(upgrade).toBeVisible();
  await expect(rests).toHaveCount(oldCount);
  await upgrade.click();
  await page.getByTestId("rhythm-save").click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]")
    .find((entry: any) => entry.mode === "rhythm")?.rhythmDocument);
  expect(saved.automaticCorrection).toBe("bounded");
  expect(saved.hits).toEqual(doc.hits);
  await page.getByTestId("web-alert-action-0").click();
  await page.getByTestId("rhythm-library-open-review").click();
  await page.getByTestId(`rhythm-saved-open-${doc.id}`).click();
  await expect(upgrade).toHaveCount(0);
  await page.screenshot({ path: "generated-artifacts/rhythm-bounded-correction.jpg" });
});

test("calibration completes from actual reference dispatch and keeps the applied value", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.getByTestId("rhythm-settings").click();
  await page.evaluate(() => {
    const original = AudioBufferSourceNode.prototype.start;
    (window as any).__calibrationStarts = [];
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof original>) {
      (window as any).__calibrationStarts.push(performance.now());
      return original.apply(this, args);
    };
  });
  await page.getByTestId("rhythm-calibration-reference").click();
  const tap = page.getByTestId("rhythm-calibration-tap");
  await tap.scrollIntoViewIfNeeded();
  for (let i = 0; i < 20; i++) {
    await page.waitForFunction((i) => (window as any).__calibrationStarts.length > i, i);
    if (i >= 4) await tap.click();
  }
  await expect(page.getByTestId("rhythm-calibration-status")).toHaveText(/보정 적용:|Applied:/);
  expect(Number(await page.getByTestId("rhythm-offset-input").inputValue())).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: "generated-artifacts/rhythm-calibration-complete.jpg" });
});

test("hold starts without recording the activation gesture; score drag cancels stop and score hold finishes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await expect(page.getByTestId("rhythm-live-feedback")).toHaveCount(0);
  await page.getByTestId("rhythm-settings").click();
  await page.getByTestId("rhythm-count-in").click();
  await page.getByTestId("rhythm-settings-close").click();
  const activation = await page.getByTestId("rhythm-activate-pad").boundingBox();
  await hold(page, activation!.x + 100, activation!.y + 40, 200);
  await expect(page.getByTestId("rhythm-activate-pad")).toBeVisible();
  await hold(page, activation!.x + 100, activation!.y + 40);
  await expect(page.getByTestId("rhythm-record-status")).toHaveText(/녹음 중|Recording/);
  await expect(page.locator('[data-testid^="rhythm-glyph-note-"]')).toHaveCount(0);
  await page.getByTestId("rhythm-pad").click();
  await page.waitForTimeout(250);
  await page.getByTestId("rhythm-pad").click();
  const score = await page.getByTestId("rhythm-stop-area").boundingBox();
  const x = score!.x + score!.width / 2, y = score!.y + 65;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x, y + 25); await page.waitForTimeout(700); await page.mouse.up();
  await expect(page.getByTestId("rhythm-record-status")).toHaveText(/녹음 중|Recording/);
  await hold(page, x, y);
  await expect(page.getByTestId("rhythm-review-stage")).toBeVisible();
  await page.getByTestId("rhythm-save").click();
  await expect.poll(async () => page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("practice_book") ?? "[]");
    return book.find((item: any) => item.mode === "rhythm")?.rhythmDocument?.hits.length;
  })).toBe(2);
  const hits = await page.evaluate(() => JSON.parse(localStorage.getItem("practice_book")!).find((item: any) => item.mode === "rhythm").rhythmDocument.hits);
  expect(hits[0].onsetMs).toBeGreaterThan(100);
  expect(hits.every((hit: any) => hit.releaseMs >= hit.onsetMs)).toBe(true);
  await page.screenshot({ path: "generated-artifacts/rhythm-review.jpg" });
});

test("fixed row count, per-row override and reset survive save/reopen and portrait/landscape fit", async ({ page }) => {
  const doc = { ...createRhythmDocument({ title: "Page fit", bpm: 120 }),
    hits: Array.from({ length: 1000 }, (_, i) => ({ id: `page-${i}`, onsetMs: i * 250, releaseMs: i * 250 + 30, drum: "snare" as const })) };
  await page.addInitScript((doc) => localStorage.setItem("rhythm_lab_documents_v1", JSON.stringify([doc])), doc);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  await page.getByTestId("rhythm-load").click();
  await page.getByTestId(`rhythm-saved-open-${doc.id}`).click();
  await page.getByTestId("rhythm-notationZoom-more").click();
  await page.getByTestId("rhythm-notationZoom-more").click();
  await page.getByTestId("rhythm-notationZoom-more").click();
  await page.getByTestId("rhythm-rowSpacing-more").click();
  await page.getByTestId("rhythm-rowSpacing-more").click();
  await expect(page.getByTestId("rhythm-notationZoom-value")).toHaveText("130%");
  await expect(page.getByTestId("rhythm-rowSpacing-value")).toHaveText("120%");
  await expect.poll(() => page.locator('[data-testid^="rhythm-notehead-note-"]').first()
    .evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThan(5);
  await page.getByTestId("rhythm-row-0").click();
  await page.getByTestId("rhythm-row-count-1").click();
  await expect(page.getByTestId("rhythm-row-1")).toBeVisible();
  const staff = page.getByTestId("rhythm-staff");
  const fits = async () => {
    await expect.poll(() => staff.getByTestId("rhythm-staff-scroll").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    expect(await staff.locator('[data-testid^="rhythm-note-target-"]').count()).toBeLessThan(300);
    expect(await staff.locator('[data-testid^="rhythm-staff-row-"]').count()).toBeLessThan(10);
  };
  await fits();
  await page.getByTestId("rhythm-flow-input").click();
  await expect(page.getByTestId("rhythm-activate-pad")).toBeVisible();
  await page.screenshot({ path: "generated-artifacts/rhythm-input-portrait.jpg" });
  await page.setViewportSize({ width: 844, height: 390 });
  await fits();
  expect((await page.getByTestId("rhythm-workspace-scroll").boundingBox())!.height).toBeGreaterThan(90);
  const pad = await page.getByTestId("rhythm-activate-pad").boundingBox();
  expect(pad!.y + pad!.height).toBeLessThanOrEqual(391);
  await page.screenshot({ path: "generated-artifacts/rhythm-input-landscape.jpg" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("rhythm-flow-review").click();
  await page.getByTestId("rhythm-save").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]")
    .find((item: any) => item.mode === "rhythm")?.rhythmDocument.staffLayout?.rowOverrides[0]?.count)).toBe(1);
  await page.getByTestId("web-alert-action-0").click();
  await page.getByTestId("rhythm-library-open-review").click();
  await page.getByTestId(`rhythm-saved-open-${doc.id}`).click();
  await expect(page.getByTestId("rhythm-notationZoom-value")).toHaveText("130%");
  await expect(page.getByTestId("rhythm-rowSpacing-value")).toHaveText("120%");
  await page.getByTestId("rhythm-row-0").click();
  await page.getByTestId("rhythm-row-reset").click();
  await expect(page.getByTestId("rhythm-row-2")).toBeVisible();
  await expect(page.getByTestId("rhythm-row-1")).toHaveCount(0);
  await page.getByTestId("rhythm-flow-input").click();
  await page.getByTestId("rhythm-settings").click();
  await page.getByTestId("rhythm-bars-per-row-more").click();
  await expect(page.getByTestId("rhythm-bars-per-row")).toHaveText("3");
  await page.getByTestId("rhythm-offset-input").fill("60");
  await page.getByTestId("rhythm-settings-close").click();
  await expect(page.getByTestId("rhythm-row-3")).toBeVisible();
  await page.getByTestId("rhythm-flow-review").click();
  await page.getByTestId("rhythm-save").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]")
    .find((item: any) => item.mode === "rhythm")?.rhythmDocument.offsetMs)).toBe(60);
  await page.getByTestId("web-alert-action-0").click();
  await page.getByTestId("rhythm-library-open-review").click();
  await page.getByTestId(`rhythm-saved-open-${doc.id}`).click();
  await page.getByTestId("rhythm-flow-input").click();
  await page.getByTestId("rhythm-settings").click();
  await expect(page.getByTestId("rhythm-offset-input")).toHaveValue("60");
  await page.getByTestId("rhythm-calibration-reference").click();
  await expect(page.getByTestId("rhythm-calibration-status")).toHaveText(/예비박|Count-in/);
  await page.getByTestId("rhythm-calibration-reset").click();
  await expect(page.getByTestId("rhythm-offset-input")).toHaveValue("0");
  await page.getByTestId("rhythm-settings-close").click();
});
