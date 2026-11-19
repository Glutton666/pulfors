import { test, expect, type Page } from "@playwright/test";
import type { StaffNotebook } from "../lib/staff-notebook";
import { DEFAULT_NOTEBOOK_SETTINGS } from "../lib/staff-notebook";
if (process.env.SETTINGS_TEST_URL) test.use({ baseURL: process.env.SETTINGS_TEST_URL });
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
  test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } });
}

test("ink vertical drag selects a tool and cumulative right swipe opens that tool's settings", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openNotebook(page);
  const origin = (await page.getByTestId("notebook-ink-tool").boundingBox())!;
  await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  const erase = (await page.getByTestId("notebook-tool-erase").boundingBox())!;
  const x = erase.x + erase.width / 2, y = erase.y + erase.height / 2;
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.move(x + 70, y, { steps: 14 });
  await page.mouse.up();
  await expect(page.getByTestId("notebook-ink-options")).toBeVisible();
  await expect(page.getByTestId("notebook-eraser-partial")).toBeVisible();
  await page.getByTestId("notebook-eraser-partial").click();
  await page.getByTestId("notebook-ink-options-close").click();
  await expect(page.getByTestId("notebook-ink-tool")).toHaveAccessibleName(/Eraser|지우개/);
  await page.screenshot({ path: "generated-artifacts/notebook-vertical-tool-gesture.png" });
});

test("portrait folds to one or two measures without changing wide layouts or losing notation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openNotebook(page);
  await openSettings(page);
  await page.getByTestId("notebook-measures-per-row").fill("4");
  await page.getByTestId("notebook-measures-per-row").press("Enter");
  await page.getByTestId("notebook-show-barlines").click();
  await page.getByTestId("notebook-panel-close").click();
  await expect(page.getByTestId("notebook-auto-barline")).toHaveCount(0);
  const paper = (await page.getByTestId("notebook-drawing").boundingBox())!;
  const staff = (await page.getByTestId("notebook-drawing").locator("line").first().boundingBox())!;
  expect(staff.x + staff.width).toBeLessThanOrEqual(paper.x + paper.width + 1);
  await page.mouse.move(paper.x + paper.width / 2, paper.y + 30);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 1000);
  await page.keyboard.up("Control");
  await expect(page.getByTestId("notebook-ink-zoom")).toHaveText("50%");
  for (let i = 0; i < 8; i++) await page.getByTestId("notebook-ink-zoom-out").click();
  await expect(page.getByTestId("notebook-ink-zoom")).toHaveText("50%");
  expect(await page.getByTestId("notebook-auto-barline").count()).toBeGreaterThan(0);
  await page.screenshot({ path: "generated-artifacts/notebook-portrait-two-measures.png" });
  await page.setViewportSize({ width: 844, height: 390 });
  // Original four-bar geometry returns; display folding never overwrites settings.
  const bars = page.getByTestId("notebook-auto-barline");
  const firstY = await bars.first().getAttribute("y1");
  expect((await bars.evaluateAll((nodes, y) => nodes.filter((node) => node.getAttribute("y1") === y).length, firstY))).toBe(3);
  await page.setViewportSize({ width: 768, height: 1024 });
  const tabletY = await bars.first().getAttribute("y1");
  expect(await bars.evaluateAll((nodes, y) => nodes.filter((node) => node.getAttribute("y1") === y).length, tabletY)).toBe(3);
  await chooseMode(page, "notes");
  await chooseGlyph(page, "clef-treble");
  await chooseGlyph(page, "time-6-8");
  await expect(page.getByTestId("notebook-clef-treble")).toHaveCount(1);
  await expect(page.getByTestId("notebook-meter-glyph")).toHaveCount(1);
});

test("one continuous note gesture preserves strong role and left-swipe dot while placing exactly once", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openNotebook(page); await chooseMode(page, "notes");
  const note = (await page.getByTestId("notebook-note-origin").boundingBox())!;
  const x = note.x + note.width / 2, y = note.y + note.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  const strong = (await page.getByTestId("notebook-note-role-strong").boundingBox())!;
  await page.mouse.move(strong.x + strong.width / 2, y, { steps: 8 });
  await page.mouse.move(strong.x + strong.width / 2, y - 140, { steps: 14 });
  const quarter = (await page.getByTestId("notebook-note-duration-quarter").boundingBox())!;
  await page.mouse.move(quarter.x + quarter.width / 2, quarter.y + quarter.height / 2, { steps: 8 });
  const dotted = (await page.getByTestId("notebook-note-dotted").boundingBox())!;
  await page.mouse.move(dotted.x + dotted.width / 2, dotted.y + dotted.height / 2, { steps: 8 });
  await page.mouse.up();
  const paper = page.getByTestId("notebook-drawing");
  await expect(paper.locator('[data-testid^="notebook-stamp-"]')).toHaveCount(1);
  await expect(paper.getByTestId("notebook-strong-mark")).toHaveCount(1);
  await expect(paper.getByTestId("notebook-dot")).toHaveCount(1);
  await page.screenshot({ path: "generated-artifacts/notebook-restored-note-gesture.png" });
});

for (const viewport of [{ width: 320, height: 740 }, { width: 768, height: 1024 }, { width: 844, height: 390 }]) {
  test(`isolated notation pickers and visible selection actions at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openNotebook(page); await chooseMode(page, "notes");
    const idle = page.getByTestId("notebook-note-idle-tools");
    if (await page.getByTestId("notebook-note-more").count()) {
      await page.getByTestId("notebook-note-more").click();
      await expect(page.getByTestId("notebook-note-more-menu")).toBeVisible();
    }
    const note = (await page.getByTestId("notebook-note-origin").boundingBox())!;
    await page.mouse.move(note.x + note.width / 2, note.y + note.height / 2); await page.mouse.down();
    await expect(page.getByTestId("notebook-note-tile")).toHaveCSS("opacity", "0");
    await expect(page.getByTestId("notebook-rest-tile")).toHaveCSS("opacity", "0");
    await expect(page.getByTestId("notebook-tuplet")).toHaveCSS("opacity", "0");
    await expect(page.getByTestId("notebook-note-more-menu")).toHaveCount(0);
    await expect(page.getByTestId("notebook-note-role-normal")).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `generated-artifacts/notebook-isolated-roles-${viewport.width}.png` });
    await page.mouse.move(note.x + note.width / 2 + 20, note.y - 80, { steps: 8 });
    await expect(page.getByTestId("notebook-note-role-normal")).toHaveCount(0);
    await expect(page.getByTestId("notebook-note-tile")).toHaveCSS("opacity", "0");
    const duration = (await page.getByTestId("notebook-note-duration-quarter").boundingBox())!;
    await page.mouse.move(duration.x + duration.width / 2, duration.y + duration.height / 2, { steps: 5 });
    await page.screenshot({ path: `generated-artifacts/notebook-isolated-duration-${viewport.width}.png` });
    await page.mouse.up(); await expect(page.getByTestId("notebook-tuplet")).toHaveCSS("opacity", "1");
    await expect(page.getByTestId("notebook-note-tile")).toHaveCSS("opacity", "1");
    const rest = (await page.getByTestId("notebook-rest-origin").boundingBox())!;
    await page.mouse.move(rest.x + rest.width / 2, rest.y + rest.height / 2); await page.mouse.down();
    await expect(page.getByTestId("notebook-tuplet")).toHaveCSS("opacity", "0");
    await expect(page.getByTestId("notebook-rest-gesture-preview")).toBeVisible();
    await expect(page.getByTestId("notebook-note-tile")).toHaveCSS("opacity", "0");
    await expect(page.getByTestId("notebook-rest-tile")).toHaveCSS("opacity", "0");
    await page.mouse.move(rest.x + rest.width / 2, rest.y - 80, { steps: 8 });
    await expect(page.getByTestId("notebook-rest-gesture-preview")).toHaveCount(0);
    await expect(page.getByTestId("notebook-rest-tile")).toHaveCSS("opacity", "0");
    const restDuration = (await page.getByTestId("notebook-rest-duration-quarter").boundingBox())!;
    await page.mouse.move(restDuration.x + restDuration.width / 2, restDuration.y + restDuration.height / 2, { steps: 5 });
    await page.mouse.up(); await expect(idle).toHaveCSS("opacity", "1");
    await expect(page.getByTestId("notebook-rest-tile")).toHaveCSS("opacity", "1");
    await expect(page.getByTestId("notebook-drawing").locator('[data-testid^="notebook-stamp-"]')).toHaveCount(2);
    await chooseMode(page, "select");
    await expect(page.getByTestId("notebook-edit-selection")).toHaveCount(0);
    for (const unit of ["object", "measure", "row"]) await expect(page.getByTestId(`notebook-select-${unit}`)).toBeInViewport({ ratio: 1 });
    await page.getByTestId("notebook-select-row").click();
    const paper = (await page.getByTestId("notebook-drawing").boundingBox())!;
    await page.mouse.click(paper.x + 45 * paper.width / 900, paper.y + 100 * paper.width / 900);
    for (const action of [
      page.getByTestId("notebook-edit-selection"), page.getByTestId("notebook-clipboard-save"),
      page.getByRole("button", { name: /^(선택 항목 삭제|Delete selection)$/ }),
      page.getByRole("button", { name: /^(선택 해제|Clear selection)$/ }),
    ]) {
      await expect(action).toBeInViewport({ ratio: 1 });
      expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: /^(선택 크기 조절|Resize selection)$/ }).click();
    await expect(page.getByRole("button", { name: /^(선택 크기 줄이기|Shrink selection)$/ })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `generated-artifacts/notebook-selection-clear-${viewport.width}.png` });
    await page.getByRole("button", { name: /^(선택 해제|Clear selection)$/ }).click();
    await expect(page.getByTestId("notebook-edit-selection")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(선택 크기 줄이기|Shrink selection)$/ })).toHaveCount(0);
  });
}

test.use({
  baseURL: process.env.NOTEBOOK_TEST_URL ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : undefined),
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  isMobile: false, hasTouch: false,
});
test.setTimeout(100000);
test.describe.configure({ mode: "parallel" });

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 844, height: 390 }]) {
  test(`compact ink toolbar exposes all actions and long-press tool selection at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript((width) => localStorage.setItem("metronome_language", width === 320 || width === 768 ? "ko" : "en"), viewport.width);
    await openNotebook(page);
    const paper = page.getByTestId("notebook-drawing");
    const positions = [];
    for (const id of ["notebook-ink-tool", "notebook-ink-undo", "notebook-ink-redo", "notebook-ink-zoom-out", "notebook-ink-zoom", "notebook-ink-zoom-in"]) {
      const action = page.getByTestId(id);
      await expect(action).toBeInViewport({ ratio: 1 });
      const box = (await action.boundingBox())!;
      if (id !== "notebook-ink-zoom") expect(box.height).toBeGreaterThanOrEqual(44);
      positions.push(box.y + box.height / 2);
    }
    positions.forEach((y) => expect(Math.abs(y - positions[0])).toBeLessThan(2));
    const original = await paper.innerHTML();
    await openInkToolMenu(page);
    await expect(page.getByTestId("notebook-ink-tool-menu")).toBeInViewport({ ratio: 1 });
    for (const tool of ["pen", "erase", "move"]) await expect(page.getByTestId(`notebook-tool-${tool}`)).toBeInViewport({ ratio: 1 });
    expect(await paper.innerHTML()).toBe(original);
    await page.screenshot({ path: `generated-artifacts/notebook-ink-selector-${viewport.width}.png` });
    await page.getByTestId("notebook-tool-erase").click();
    await expect(page.getByTestId("notebook-ink-tool")).toHaveAccessibleName(/Eraser|지우개/);
    await chooseInkTool(page, "move");
    await expect(page.getByTestId("notebook-ink-tool")).toHaveAccessibleName(/Pan|화면 이동/);
    const dock = (await page.getByTestId("notebook-tools-dock").boundingBox())!;
    for (const id of ["notebook-ink-tool", "notebook-ink-undo", "notebook-ink-redo", "notebook-ink-zoom-out", "notebook-ink-zoom-in"]) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(dock.x);
      expect(box.x + box.width).toBeLessThanOrEqual(dock.x + dock.width);
    }
    await chooseInkTool(page, "pen");
    await expect(page.getByTestId("notebook-ink-tool")).toHaveAccessibleName(/Pen|펜/);
    await paperDrag(page, { x: 100, y: 230 }, { x: 220, y: 230 });
    await expect(paper.locator('[data-testid^="notebook-ink-"]')).toHaveCount(1);
    await page.getByTestId("notebook-ink-undo").click();
    await expect(paper.locator('[data-testid^="notebook-ink-"]')).toHaveCount(0);
    await page.getByTestId("notebook-ink-redo").click();
    await expect(paper.locator('[data-testid^="notebook-ink-"]')).toHaveCount(1);
    await page.getByTestId("notebook-ink-zoom-in").click();
    await expect(page.getByTestId("notebook-ink-zoom")).toHaveText("110%");
    await page.getByTestId("notebook-ink-zoom-out").click();
    await expect(page.getByTestId("notebook-ink-zoom")).toHaveText("100%");
    const handle = (await page.getByTestId("notebook-tools-handle").boundingBox())!;
    const stage = (await page.getByTestId("notebook-paper-stage").boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, stage.y + 32, { steps: 12 });
    await page.mouse.up();
    await openInkToolMenu(page);
    await expect(page.getByTestId("notebook-ink-tool-menu")).toBeInViewport({ ratio: 1 });
  });
}

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 844, height: 390 }]) {
  test(`single-row notebook controls stay reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openNotebook(page);
    const random = page.getByTestId("notebook-playback-random");
    const play = page.getByTestId("notebook-play");
    await expect(random).toBeInViewport({ ratio: 1 });
    await expect(play).toBeInViewport({ ratio: 1 });
    const shuffleBox = (await random.boundingBox())!, playBox = (await play.boundingBox())!;
    expect(shuffleBox.x + shuffleBox.width).toBeLessThanOrEqual(playBox.x);
    expect(Math.abs(shuffleBox.y + shuffleBox.height / 2 - playBox.y - playBox.height / 2)).toBeLessThan(2);
    await expect(random).toHaveAttribute("aria-checked", "false");
    await random.click(); await expect(random).toHaveAttribute("aria-checked", "true");
    await openSettings(page);
    await expect(page.getByTestId("notebook-random")).toBeChecked();
    await page.getByTestId("notebook-random").click();
    await expect(random).toHaveAttribute("aria-checked", "false");
    await page.getByTestId("notebook-panel-close").click();
    await page.getByTestId("notebook-playback-collapse").click();
    await expect(random).toBeInViewport({ ratio: 1 });
    await expect(play).toBeInViewport({ ratio: 1 });
    await page.getByTestId("notebook-playback-collapse").click();
    if (viewport.width >= 768) {
      const tools = (await page.getByTestId("notebook-tools-dock").boundingBox())!;
      const last = (await page.getByLabel(/^Zoom in$|^확대$/).boundingBox())!;
      expect(tools.x + tools.width - last.x - last.width).toBeLessThanOrEqual(15);
      await expect(page.getByLabel(/^Zoom in$|^확대$/)).toBeInViewport({ ratio: 1 });
    } else {
      await page.getByLabel(/^Zoom in$|^확대$/).scrollIntoViewIfNeeded();
      await expect(page.getByLabel(/^Zoom in$|^확대$/)).toBeInViewport({ ratio: 1 });
    }
    await chooseMode(page, "notes");
    const boxes = [];
    for (const id of ["notebook-note-origin", "notebook-rest-origin", "notebook-tuplet", "notebook-category-marks"]) {
      const control = page.getByTestId(id);
      await expect(control).toBeInViewport({ ratio: 1 });
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      boxes.push(box);
    }
    boxes.forEach((box) => expect(Math.abs(box.y - boxes[0].y)).toBeLessThan(2));
    await chooseGlyph(page, "quarter");
    const more = page.getByTestId("notebook-note-more");
    if (viewport.width < 500) {
      await expect(more).toBeInViewport({ ratio: 1 });
      await more.click();
      await expect(page.getByTestId("notebook-note-more-menu")).toBeInViewport({ ratio: 1 });
    } else await expect(more).toHaveCount(0);
    for (const id of ["notebook-auto-space", "notebook-note-undo", "notebook-note-redo"]) {
      await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({ path: `generated-artifacts/notebook-one-row-${viewport.width}.png` });
    await noteAction(page, "notebook-note-undo");
    await expect(page.getByTestId("notebook-drawing").locator('[data-testid^="notebook-stamp-"]')).toHaveCount(0);
    await noteAction(page, "notebook-note-redo");
    await expect(page.getByTestId("notebook-drawing").locator('[data-testid^="notebook-stamp-"]')).toHaveCount(1);
    if (viewport.width < 500) {
      const handle = (await page.getByTestId("notebook-tools-handle").boundingBox())!;
      const stage = (await page.getByTestId("notebook-paper-stage").boundingBox())!;
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2, stage.y + 32, { steps: 12 });
      await page.mouse.up();
      await more.click();
      await expect(page.getByTestId("notebook-note-more-menu")).toBeInViewport({ ratio: 1 });
    }
  });
}

test("tuplet toggle bounds beams, including leading/middle/trailing rests and cancellation", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openNotebook(page);
  await chooseMode(page, "notes");
  const paper = page.getByTestId("notebook-drawing");
  for (let i = 0; i < 3; i++) await chooseGlyph(page, "eighth");
  await expect(paper.getByTestId("notebook-beam-group")).toHaveCount(0);
  await expect(paper.getByTestId("notebook-note-flag-0")).toHaveCount(3);
  await page.getByTestId("notebook-tuplet").click();
  for (const glyph of ["rest-eighth", "eighth", "rest-eighth", "eighth", "rest-eighth"]) await chooseGlyph(page, glyph);
  await expect(paper.getByTestId("notebook-beam-level-1")).toHaveCount(1);
  await expect(paper.getByTestId("notebook-note-stem")).toHaveCount(5); // Three ordinary plus two grouped notes; no rest stems.
  await page.getByTestId("notebook-tuplet").click();
  await expect(paper.getByTestId("notebook-tuplet-number")).toHaveText("5");
  await expect(paper.getByTestId("notebook-tuplet-left")).toHaveCount(1);
  await chooseGlyph(page, "eighth");
  await expect(paper.getByTestId("notebook-beam-group")).toHaveCount(1);
  await expect(paper.getByTestId("notebook-note-flag-0")).toHaveCount(4);
  await page.getByTestId("notebook-tuplet").click();
  await chooseGlyph(page, "sixteenth"); await chooseGlyph(page, "sixteenth");
  await expect(paper.getByTestId("notebook-beam-group")).toHaveCount(2);
  await page.getByTestId("notebook-tuplet-cancel").click();
  await expect(paper.getByTestId("notebook-beam-group")).toHaveCount(1);
  await expect(paper.getByTestId("notebook-note-flag-0")).toHaveCount(6);
  await page.getByTestId("notebook-note-undo").click();
  await expect(paper.locator('[data-testid^="notebook-stamp-"]')).toHaveCount(10);
  await page.getByTestId("notebook-note-redo").click();
  await expect(paper.locator('[data-testid^="notebook-stamp-"]')).toHaveCount(11);
  await openSettings(page); await page.getByTestId("notebook-save").click(); await closeNotice(page);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0]);
  expect(saved.pages[0].tuplets).toHaveLength(1);
  expect(saved.pages[0].tuplets[0].stampIds).toEqual(saved.pages[0].stamps.slice(3, 8).map((stamp: { id: string }) => stamp.id));
  await page.reload();
  await page.getByTestId("mode-cycle-label").waitFor();
  await enterNotebook(page); await openSettings(page); await openSaved(page, saved.title);
  await page.getByTestId("notebook-panel-close").click();
  await expect(paper.getByTestId("notebook-tuplet-number")).toHaveText("5");
  await expect(paper.getByTestId("notebook-beam-group")).toHaveCount(1);
  await expect(paper.getByTestId("notebook-note-flag-0")).toHaveCount(6);
  await page.screenshot({ path: "generated-artifacts/notebook-explicit-rest-beams.png" });
});

test("whole-note engraved silhouette is shared by paper and the picker", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openNotebook(page);
  await chooseMode(page, "notes");
  await chooseGlyph(page, "whole");
  const paper = page.getByTestId("notebook-drawing");
  const head = paper.getByTestId("notebook-note-head");
  await expect(head).toHaveAttribute("fill-rule", "evenodd");
  await expect(head).toHaveAttribute("fill", "#111111");
  await expect(paper.getByTestId("notebook-note-stem")).toHaveCount(0);
  await expect(page.getByTestId("notebook-note-origin").getByTestId("notebook-note-head"))
    .toHaveAttribute("d", (await head.getAttribute("d"))!);
  await page.screenshot({ path: "generated-artifacts/notebook-whole-note.png" });
});

for (const viewport of [{ width: 320, height: 740 }, { width: 768, height: 1024 }]) {
  test(`floating bars move only by their handles and stay usable after resize at ${viewport.width}`, async ({ page, context }) => {
    await page.setViewportSize(viewport);
    await openNotebook(page);
    const stage = page.getByTestId("notebook-paper-stage");
    const playback = page.getByTestId("notebook-playback-dock");
    const tools = page.getByTestId("notebook-tools-dock");
    const paper = page.getByTestId("notebook-drawing");
    await expect(playback).toBeInViewport({ ratio: 1 });
    await expect(tools).toBeInViewport({ ratio: 1 });
    const stageBox = (await stage.boundingBox())!;
    const top = (await playback.boundingBox())!, bottom = (await tools.boundingBox())!;
    expect(top.width).toBeLessThanOrEqual(424);
    expect(bottom.width).toBeLessThanOrEqual(680);
    expect(Math.abs(top.x + top.width / 2 - (stageBox.x + stageBox.width / 2))).toBeLessThan(1);
    expect(Math.abs(bottom.x + bottom.width / 2 - (stageBox.x + stageBox.width / 2))).toBeLessThan(1);
    const blank = await paper.innerHTML();
    const dragHandle = async (id: "playback" | "tools", dx: number, dy: number) => {
      const box = (await page.getByTestId(`notebook-${id}-handle`).boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 10 });
      await page.mouse.up();
    };
    await dragHandle("tools", 0, -120);
    expect((await tools.boundingBox())!.y).toBeCloseTo(bottom.y - 120, 0);
    expect((await playback.boundingBox())!.y).toBeCloseTo(top.y, 0);
    await dragHandle("playback", 20, 110);
    expect((await playback.boundingBox())!.y).toBeCloseTo(top.y + 110, 0);
    expect(await paper.innerHTML()).toBe(blank);
    const moved = (await playback.boundingBox())!;
    await page.getByTestId("notebook-bpm").fill("96");
    await page.getByTestId("notebook-bpm").press("Enter");
    await page.getByTestId("notebook-meter").click();
    await page.getByTestId("notebook-meter-3").click();
    expect((await playback.boundingBox())!.x).toBeCloseTo(moved.x, 0);
    expect((await playback.boundingBox())!.y).toBeCloseTo(moved.y, 0);
    await expect(page.getByTestId("notebook-bpm")).toHaveValue("96");
    await page.getByTestId("notebook-tools-handle").focus();
    const oldY = (await tools.boundingBox())!.y;
    await page.getByTestId("notebook-tools-handle").press("ArrowUp");
    expect((await tools.boundingBox())!.y).toBeCloseTo(oldY - 16, 0);
    if (viewport.width === 768) {
      const handle = (await page.getByTestId("notebook-tools-handle").boundingBox())!;
      const prior = (await tools.boundingBox())!;
      const cdp = await context.newCDPSession(page);
      const point = (dx: number, dy: number) => ({ id: 1, x: handle.x + handle.width / 2 + dx,
        y: handle.y + handle.height / 2 + dy, radiusX: 3, radiusY: 3, force: 1 });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(0, 0)] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(24, -40)] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      expect((await tools.boundingBox())!.y).toBeCloseTo(prior.y - 40, 0);
      expect(await paper.innerHTML()).toBe(blank);
      await cdp.detach();
    }
    await chooseMode(page, "notes");
    await chooseGlyph(page, "quarter");
    await chooseGlyph(page, "rest-eighth");
    await expect(paper.locator('[data-testid^="notebook-stamp-"]')).toHaveCount(2);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(playback).toBeInViewport({ ratio: 1 });
    await expect(tools).toBeInViewport({ ratio: 1 });
    await page.getByTestId("notebook-category-marks").click();
    await expect(page.getByTestId("notebook-symbol-sharp")).toBeInViewport({ ratio: 0.5 });
    await page.getByLabel(/^Close tools$|^도구 닫기$/).click();
    await dragHandle("playback", 0, 10000);
    await expect(playback).toBeInViewport({ ratio: 1 });
    await page.getByTestId("notebook-meter").click();
    await expect(page.getByTestId("notebook-meter-1")).toBeInViewport({ ratio: 1 });
    await page.getByTestId("notebook-meter-1").click();
    await page.screenshot({ path: `generated-artifacts/notebook-floating-resized-${viewport.width}.png` });
    await page.getByTestId("notebook-playback-handle").focus();
    await page.getByTestId("notebook-playback-handle").press("Home");
    expect((await playback.boundingBox())!.y).toBeCloseTo((await stage.boundingBox())!.y + 8, 0);
  });
}

for (const [width, height, language] of [
  [320, 740, "ko"], [390, 844, "en"], [768, 1024, "ko"], [844, 390, "en"],
] as const) {
  test(`equal toolbar and manual row spacing at ${width}x${height} ${language}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const reference = {
      id: "spacing", title: "Equal spacing", updatedAt: 1,
      settings: { ...DEFAULT_NOTEBOOK_SETTINGS, rowsPerPage: 7 },
      pages: [{ id: "spacing-page", staffCount: 7, anchor: { x: 260, y: 114 },
        strokes: [{ id: "ink", width: 3, color: "#2468c4", points: [{ x: 80, y: 135 }, { x: 450, y: 135 }] }],
        stamps: [
          { id: "a", glyph: "eighth", x: 90, y: 114, size: 26, dotted: true },
          { id: "b", glyph: "rest-eighth", x: 125, y: 108, size: 26 },
          { id: "c", glyph: "sixteenth", x: 260, y: 114, size: 26 },
          { id: "sharp", glyph: "sharp", x: 70, y: 114, size: 26, attachTo: "a" },
          { id: "outside", glyph: "quarter", x: 100, y: 269, size: 26 },
        ], tuplets: [{ id: "t", stampIds: ["a", "b", "c"] }] }],
    };
    await page.addInitScript(({ reference, language }) => {
      localStorage.setItem("metronome_language", language);
      if (!localStorage.getItem("lab_staff_notebooks_v1")) localStorage.setItem("lab_staff_notebooks_v1", JSON.stringify([reference]));
    }, { reference, language });
    await openNotebook(page); await openSettings(page); await openSaved(page, reference.title);
    await page.getByTestId("notebook-panel-close").click();
    await chooseMode(page, "notes");
    const controls = ["notebook-note-tile", "notebook-rest-tile", "notebook-tuplet", "notebook-category-marks"];
    const boxes = [];
    for (const control of controls) {
      await expect(page.getByTestId(control)).toBeInViewport({ ratio: 1 });
      const box = (await page.getByTestId(control).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      boxes.push(box);
    }
    boxes.forEach((box) => {
      expect(Math.abs(box.width - boxes[0].width)).toBeLessThan(3);
      expect(Math.abs(box.height - boxes[0].height)).toBeLessThan(3);
      expect(Math.abs(box.y - boxes[0].y)).toBeLessThan(2);
    });
    const auto = page.getByTestId("notebook-auto-space");
    if (!await auto.isVisible()) await page.getByTestId("notebook-note-more").click();
    await expect(auto).toBeInViewport({ ratio: 1 });
    const paper = page.getByTestId("notebook-drawing");
    const content = () => paper.getByTestId("notebook-stamp-a").innerHTML();
    const before = await content();
    await noteAction(page, "notebook-auto-space");
    const corrected = await content();
    expect(corrected).not.toBe(before);
    await noteAction(page, "notebook-auto-space");
    expect(await content()).toBe(corrected);
    await noteAction(page, "notebook-note-undo");
    expect(await content()).toBe(before);
    await noteAction(page, "notebook-note-redo");
    expect(await content()).toBe(corrected);
    await expect(paper.getByTestId("notebook-tuplet-number")).toHaveText("3");
    await page.getByTestId("notebook-category-marks").click();
    await expect(page.getByTestId("notebook-symbol-drawer")).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId("notebook-symbol-sharp")).toBeInViewport({ ratio: 0.5 });
    await page.screenshot({ path: `generated-artifacts/notebook-tools-marks-${width}.png` });
    await page.getByLabel(/^Close tools$|^도구 닫기$/).click();
    await page.screenshot({ path: `generated-artifacts/notebook-tools-spacing-${width}.png` });
    await openSettings(page); await page.getByTestId("notebook-save").click(); await closeNotice(page);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0]);
    const stamps = saved.pages[0].stamps;
    expect(stamps[1].x - stamps[0].x).toBeCloseTo(stamps[2].x - stamps[1].x);
    expect(stamps[3].x - stamps[0].x).toBe(-20);
    expect(stamps.map((s: { y: number }) => s.y)).toEqual(reference.pages[0].stamps.map((s) => s.y));
    expect(saved.pages[0].strokes).toEqual(reference.pages[0].strokes);
    expect(saved.pages[0].tuplets).toEqual(reference.pages[0].tuplets);
    expect(stamps[4]).toEqual(reference.pages[0].stamps[4]);
    await page.reload();
    await page.getByTestId("mode-cycle-label").waitFor();
    await enterNotebook(page); await openSettings(page); await openSaved(page, reference.title);
    await page.getByTestId("notebook-panel-close").click();
    expect(await content()).toBe(corrected);
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 844, height: 390 }]) {
  test(`only explicit tuplet notes beam and notation meter persists at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      if (localStorage.getItem("lab_staff_notebooks_v1")) return;
      const row = (glyphs: string[], index: number, prefix: string) => glyphs.map((glyph, i) => ({
        id: `${prefix}${i}`, glyph, x: 90 + i * 50, y: 114 + index * 155, size: 26,
      }));
      const dotted = row(["eighth", "sixteenth", "eighth"], 2, "d");
      const stamps = [
        ...row(Array(8).fill("eighth"), 0, "a"),
        ...row(Array(4).fill("sixteenth"), 1, "s"),
        ...dotted.map((stamp, i) => ({ ...stamp, dotted: i === 0, role: i === 1 ? "strong" : "normal" })),
        ...row(["sixteenth", "thirty_second", "eighth"], 3, "t"),
        ...row(["eighth", "rest-eighth", "eighth", "eighth"], 4, "r"),
      ];
      localStorage.setItem("lab_staff_notebooks_v1", JSON.stringify([{
        id: "auto-beams", title: "Explicit tuplet beams", updatedAt: 1,
        settings: { follow: false, lineUnit: "measure", playbackZoom: 1, bpm: 84,
          random: false, offsetX: 0, offsetY: 0, snap: true, beatsPerMeasure: 4 },
        pages: [{ id: "p", strokes: [], staffCount: 7, stamps,
          tuplets: [{ id: "triplet", stampIds: ["t0", "t1", "t2"] }] }],
      }]));
    });
    await openNotebook(page);
    await openSettings(page); await openSaved(page, "Explicit tuplet beams");
    await page.getByTestId("notebook-panel-close").click();
    const paper = page.getByTestId("notebook-drawing");
    const firstRowBeams = () => paper.getByTestId("notebook-beam-level-1").evaluateAll((elements) =>
      elements.filter((element) => Number(element.getAttribute("points")!.split(/[ ,]/)[1]) < 155).length);
    await expect.poll(firstRowBeams).toBe(0);
    await expect(paper.getByTestId("notebook-beam-level-1")).toHaveCount(1);
    await expect(paper.getByTestId("notebook-tuplet-number")).toHaveText("3");
    await expect(paper.getByTestId("notebook-tuplet-left")).toHaveCount(0);
    await expect(paper.getByTestId("notebook-beam-level-2")).not.toHaveCount(0);
    await expect(paper.getByTestId("notebook-beam-hook")).not.toHaveCount(0);
    await expect(paper.getByTestId("notebook-stamp-a0").getByTestId("notebook-note-flag-0")).toHaveCount(1);
    await expect(paper.getByTestId("notebook-stamp-r0").getByTestId("notebook-note-flag-0")).toHaveCount(1);
    await expect(paper.getByTestId("notebook-stamp-t0").getByTestId("notebook-note-flag-0")).toHaveCount(0);
    await page.screenshot({ path: `generated-artifacts/explicit-beams-${viewport.width}.png` });

    await openSettings(page);
    // Changing the denominator by clicking away must preserve an unsubmitted numerator.
    await page.getByTestId("notebook-notation-beats").fill("6");
    await page.getByTestId("notebook-notation-unit-8").click();
    await expect(page.getByTestId("notebook-notation-beats")).toHaveValue("6");
    await page.getByTestId("notebook-panel-close").click();
    await expect.poll(firstRowBeams).toBe(0);
    await openSettings(page);
    await page.getByTestId("notebook-save").click(); await closeNotice(page);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0]);
    expect(saved.settings.notationMeter).toEqual({ beats: 6, unit: 8 });
    expect(saved.settings.beatsPerMeasure).toBe(4);
    expect(saved.settings.bpm).toBe(84);
    await page.reload();
    await page.getByTestId("mode-cycle-label").waitFor();
    await enterNotebook(page); await openSettings(page); await openSaved(page, "Explicit tuplet beams");
    await expect(page.getByTestId("notebook-notation-beats")).toHaveValue("6");
    await page.getByTestId("notebook-panel-close").click();
    await expect.poll(firstRowBeams).toBe(0);
  });
}

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

test("manual boundary editing refreshes effective measures without moving notes when automatic spacing is off", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const reference: StaffNotebook = {
    id: "boundary-ownership", title: "Boundary ownership", updatedAt: 1,
    settings: { ...DEFAULT_NOTEBOOK_SETTINGS, autoSpacing: false, measuresPerRow: 4, rowsPerPage: 7 },
    pages: [{ id: "boundary-page", staffCount: 7, strokes: [], stamps: [
      { id: "a", glyph: "quarter", x: 150, y: 257, size: 26, measure: 0 },
      { id: "b", glyph: "quarter", x: 330, y: 257, size: 26, measure: 1 },
      { id: "bar", glyph: "barline", x: 244, y: 257, size: 26, measure: 1 },
    ] }],
  };
  await page.addInitScript((ref) => {
    if (!localStorage.getItem("lab_staff_notebooks_v1")) localStorage.setItem("lab_staff_notebooks_v1", JSON.stringify([ref]));
    localStorage.setItem("metronome_language", "ko");
  }, reference);
  await openNotebook(page); await openSettings(page); await openSaved(page, reference.title);
  await page.getByTestId("notebook-panel-close").click();
  await chooseMode(page, "notes");
  const paper = (await page.getByTestId("notebook-drawing").boundingBox())!, ratio = paper.width / 900;
  await page.mouse.click(paper.x + 244 * ratio, paper.y + 257 * ratio);
  await paperDrag(page, { x: 244, y: 257 }, { x: 500, y: 257 });
  await expect(page.getByText("마디선 위치를 변경합니다", { exact: true })).toBeVisible();
  await page.getByText("계속", { exact: true }).last().click();
  await openSettings(page); await page.getByTestId("notebook-save").click(); await closeNotice(page);
  const saved: StaffNotebook = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!).find((n: StaffNotebook) => n.id === "boundary-ownership"));
  const savedStamps = saved.pages[0].stamps!;
  expect(savedStamps.find((s) => s.id === "a")).toEqual(reference.pages[0].stamps![0]);
  expect(savedStamps.find((s) => s.id === "b")).toEqual({ ...reference.pages[0].stamps![1], measure: 0 });
  expect(Math.abs(savedStamps.find((s) => s.id === "bar")!.x - 500)).toBeLessThan(1 / ratio);
  expect(savedStamps.find((s) => s.id === "bar")!.measure).toBe(1);
});

for (const width of [390, 768, 844]) test(`musical-layout settings, group edit and random copy at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : width === 844 ? 390 : 1024 });
  const reference: StaffNotebook = {
    id: `layout-journey-${width}`, title: `Layout verification ${width}`, updatedAt: 1,
    settings: { ...DEFAULT_NOTEBOOK_SETTINGS, autoSpacing: false, autoScale: true, notationMeter: { beats: 4, unit: 4 }, measuresPerRow: 2, rowsPerPage: 3 },
    pages: [{ id: "reference-page", staffCount: 3,
      stamps: Array.from({ length: 16 }, (_, i) => ({ id: `layout-${i}`, glyph: "sixteenth", x: 50 + i * 30, y: 102, size: 26, role: i === 0 ? "strong" : "normal" })),
      strokes: [{ id: "reference-ink", width: 2, points: [{ x: 100, y: 115 }, { x: 150, y: 115 }] }],
      tuplets: [{ id: "reference-tuplet", stampIds: ["layout-0", "layout-1", "layout-2"], ratio: { actual: 3, normal: 2 } }],
      anchor: { x: 500, y: 102 },
    }],
  };
  await page.addInitScript((ref) => {
    if (!localStorage.getItem("lab_staff_notebooks_v1")) localStorage.setItem("lab_staff_notebooks_v1", JSON.stringify([ref]));
    localStorage.setItem("metronome_language", "ko");
  }, reference);
  await openNotebook(page);
  await openSettings(page);
  await openSaved(page, reference.title);
  for (const id of ["notebook-auto-spacing", "notebook-auto-scale", "notebook-show-barlines", "notebook-measures-per-row", "notebook-random-unit-measure", "notebook-random-unit-row", "notebook-random-signs"]) {
    await page.getByTestId(id).scrollIntoViewIfNeeded();
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await page.getByTestId("notebook-auto-spacing").click();
  await expect(page.getByTestId("notebook-layout-choice")).toBeVisible();
  await page.getByTestId("notebook-layout-option-2").click();
  await expect(page.getByTestId("notebook-layout-choice")).not.toBeVisible();
  await page.getByTestId("notebook-show-barlines").click();
  await page.getByTestId("notebook-save").click();
  await closeNotice(page);
  const read = () => page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!));
  const arranged = (await read()).find((n: StaffNotebook) => n.id === reference.id) as StaffNotebook;
  expect(arranged.settings!.measuresPerRow).toBe(2);
  expect(arranged.settings!.autoSpacing).toBe(true);
  expect(arranged.pages[0].measureCounts![0]).toBe(1);
  expect(arranged.pages.flatMap((p) => p.stamps ?? []).filter((s) => !s.generated)).toHaveLength(16);
  expect(arranged.pages.flatMap((p) => p.tuplets ?? [])[0].ratio).toEqual({ actual: 3, normal: 2 });
  await page.getByTestId("notebook-auto-spacing").click();
  await page.getByTestId("notebook-save").click();
  await closeNotice(page);
  const disabled = (await read()).find((n: StaffNotebook) => n.id === reference.id) as StaffNotebook;
  expect(disabled.pages).toEqual(arranged.pages);
  await page.getByTestId("notebook-panel-close").click();
  await chooseMode(page, "select");
  await page.getByTestId("notebook-select-row").click();
  const paper = (await page.getByTestId("notebook-drawing").boundingBox())!;
  // The draggable control docks cover the middle on short landscape screens.
  // Select the same row at its unobstructed left edge.
  await page.mouse.click(paper.x + 45 * paper.width / 900, paper.y + 100 * paper.width / 900);
  await expect(page.getByTestId("notebook-edit-selection")).toBeEnabled();
  await page.getByTestId("notebook-edit-selection").click();
  await expect(page.getByTestId("notebook-object-editor")).toBeVisible();
  await page.getByTestId("notebook-ratio-normal").fill("1");
  await page.getByTestId("notebook-ratio-apply").click();
  await page.getByRole("button", { name: "편집기 닫기", exact: true }).click();
  await openSettings(page);
  await page.getByTestId("notebook-save").click();
  await closeNotice(page);
  const edited = (await read()).find((n: StaffNotebook) => n.id === reference.id) as StaffNotebook;
  expect(edited.pages.flatMap((p) => p.tuplets ?? [])[0].ratio).toEqual({ actual: 3, normal: 1 });
  await page.getByTestId("notebook-panel-close").click();
  await page.getByTestId("notebook-playback-random").click();
  await openSettings(page);
  await page.getByTestId("notebook-reshuffle").click();
  await page.getByTestId("notebook-panel-close").click();
  await page.getByTestId("notebook-playback-random").click();
  await expect(page.getByText("현재 순서를 저장할까요?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^저장$/ }).click();
  await expect.poll(async () => (await read()).length).toBe(2);
  const saved = await read() as StaffNotebook[];
  expect(saved.find((n) => n.id === reference.id)!.pages).toEqual(edited.pages);
  expect(saved.find((n) => n.id !== reference.id)!.settings!.random).toBe(false);
  await page.screenshot({ path: `generated-artifacts/notebook-layout-${width}.png` });
});

async function enterNotebook(page: Page) {
  await test.step("Open Lab through the keyboard-owned mode dial", async () => {
    await page.getByTestId("mode-cycle-label").click();
    const dial = page.getByTestId("mode-dial-touch-frame");
    await expect(dial).toBeVisible();
    // Pick by the public accessibility value, not animation timing or pixels.
    for (let step = 0; step < 5 && !/^(Menu|메뉴)$/.test(await dial.getAttribute("aria-valuetext") ?? ""); step += 1) {
      await page.keyboard.press("ArrowLeft");
    }
    await expect(dial).toHaveAttribute("aria-valuetext", /^(Menu|메뉴)$/);
    await page.keyboard.press("Enter");
    await expect(dial).toHaveCount(0);
    await page.getByTestId("menu-lab").click();
  });
  await test.step("Open the notebook and wait for its drawing surface", async () => {
    await page.getByTestId("menu-staff-notebook").click();
    await expect(page.getByTestId("notebook-drawing")).toBeVisible();
  });
}
async function closeNotice(page: Page) {
  const ok = page.getByText(/^OK$|^확인$/).last();
  if (await ok.isVisible()) await ok.click();
}
async function latestSavedNotebook(page: Page): Promise<StaffNotebook> {
  return page.evaluate(() => {
    const registry = JSON.parse(localStorage.getItem("local_profiles_v1") ?? "null");
    const active = registry?.profiles.find((profile: { id: string }) => profile.id === registry.activeId);
    const key = active && active.storage !== "legacy"
      ? `local_profile:${active.id}:lab_staff_notebooks_v1`
      : "lab_staff_notebooks_v1";
    const notes = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!notes[0]) throw new Error("No notebook was saved in the active profile");
    return notes[0];
  });
}
async function chooseMode(page: Page, mode: "ink" | "notes" | "select" | "settings") {
  await page.getByTestId("notebook-right-toggle").click();
  await page.getByTestId(`notebook-mode-${mode}`).click();
}
async function openSettings(page: Page) { await chooseMode(page, "settings"); }
async function noteAction(page: Page, id: string) {
  const action = page.getByTestId(id);
  if (!await action.isVisible()) await page.getByTestId("notebook-note-more").click();
  await action.click();
}
async function chooseGlyph(page: Page, glyph: string) {
  const category = glyph.startsWith("rest-") ? "rest" : ["whole", "half", "quarter", "eighth", "sixteenth", "thirty_second"].includes(glyph) ? "note" : "marks";
  if (category === "note") {
    await page.waitForTimeout(260);
    await page.getByTestId("notebook-note-origin").focus();
    await page.getByTestId("notebook-note-origin").press("Enter");
    await page.getByTestId("notebook-note-role-normal").click();
    await page.getByTestId("notebook-note-plain").click();
    await page.getByTestId(`notebook-note-duration-${glyph}`).click();
  } else if (category === "rest") {
    await page.waitForTimeout(260);
    await page.getByTestId("notebook-rest-origin").focus();
    await page.getByTestId("notebook-rest-origin").press("Enter");
    await page.getByTestId("notebook-rest-plain").click();
    await page.getByTestId(`notebook-rest-duration-${glyph.slice(5)}`).click();
  } else {
    await page.getByTestId(`notebook-category-${category}`).click();
    await page.getByTestId(`notebook-symbol-${glyph}`).click();
  }
}
async function rowsTo(page: Page, value: number) {
  await page.getByTestId("notebook-rows").fill(String(value));
  await page.getByTestId("notebook-rows").press("Enter");
}
async function paperDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const box = (await page.getByTestId("notebook-drawing").boundingBox())!;
  const ratio = box.width / 900;
  await page.mouse.move(box.x + from.x * ratio, box.y + from.y * ratio);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x * ratio, box.y + to.y * ratio, { steps: 12 });
  await page.mouse.up();
}

async function holdInkTool(page: Page, tool: "pen" | "erase") {
  await openInkToolMenu(page);
  await page.getByTestId(`notebook-ink-options-${tool}`).click();
  await expect(page.getByTestId("notebook-ink-options")).toBeVisible();
}
async function openInkToolMenu(page: Page) {
  const box = (await page.getByTestId("notebook-ink-tool").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up();
  await expect(page.getByTestId("notebook-ink-tool-menu")).toBeVisible();
}
async function chooseInkTool(page: Page, tool: "pen" | "erase" | "move") {
  await openInkToolMenu(page);
  await page.getByTestId(`notebook-tool-${tool}`).click();
  await expect(page.getByTestId("notebook-ink-tool-menu")).toHaveCount(0);
}
for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 844, height: 390 }]) {
  test(`ink options and partial cuts persist without leaking input at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openNotebook(page);
    const paper = page.getByTestId("notebook-drawing");
    await chooseInkTool(page, "move");
    await holdInkTool(page, "pen");
    await expect(page.getByTestId("notebook-ink-options")).toBeInViewport({ ratio: 1 });
    // A long press must not also execute the short tool-selection action.
    await expect(page.getByTestId("notebook-ink-tool")).toHaveAccessibleName(/Pan|화면 이동/);
    await page.getByTestId("notebook-ink-color-2").click();
    await page.getByTestId("notebook-ink-width-6").click();
    const bounds = (await paper.boundingBox())!;
    await page.mouse.click(bounds.x + 10, bounds.y + 10);
    await expect(paper.locator('[data-testid^="notebook-ink-"]')).toHaveCount(0);
    // Backdrop click may close the modal.
    if (await page.getByTestId("notebook-ink-options-close").isVisible()) await page.getByTestId("notebook-ink-options-close").click();
    await chooseInkTool(page, "pen");
    await paperDrag(page, { x: 140, y: 110 }, { x: 360, y: 110 });
    await expect(paper.locator('path[stroke="#2468c4"][stroke-width="6"]')).toHaveCount(1);
    await holdInkTool(page, "erase");
    await expect(page.getByTestId("notebook-ink-options")).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `generated-artifacts/notebook-eraser-popup-${viewport.width}.png` });
    await page.getByTestId("notebook-eraser-partial").click();
    await page.getByTestId("notebook-ink-options-close").click();
    await chooseInkTool(page, "erase");
    await paperDrag(page, { x: 250, y: 80 }, { x: 250, y: 140 });
    await expect(paper.locator("mask")).toHaveCount(1);
    await page.getByLabel(/^Undo$|^실행 취소$/).click();
    await expect(paper.locator("mask")).toHaveCount(0);
    await page.getByLabel(/^Redo$|^다시 실행$/).click();
    await expect(paper.locator("mask")).toHaveCount(1);
    await page.screenshot({ path: `generated-artifacts/notebook-partial-ink-${viewport.width}.png` });
    await openSettings(page); await page.getByTestId("notebook-save").click(); await closeNotice(page);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0]);
    expect(saved.pages[0].strokes).toHaveLength(1);
    expect(saved.pages[0].strokes[0]).toMatchObject({ color: "#2468c4", width: 6 });
    expect(saved.pages[0].strokes[0].erasures).toHaveLength(1);
    await openSaved(page, saved.title); await page.getByTestId("notebook-panel-close").click();
    await expect(paper.locator("mask")).toHaveCount(1);
    await expect(paper.locator('path[stroke="#2468c4"][stroke-width="6"]')).toHaveCount(1);
  });
}

test("second-finger takeover cancels ink, erasing and note/selection movement without undo residue", async ({ page, context }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openNotebook(page);
  await paperDrag(page, { x: 100, y: 110 }, { x: 300, y: 110 });
  await chooseMode(page, "notes"); await chooseGlyph(page, "quarter");
  const paper = page.getByTestId("notebook-drawing");
  const cdp = await context.newCDPSession(page);
  for (const mode of ["pen", "erase", "notes", "select"] as const) {
    if (mode === "pen" || mode === "erase") { await chooseMode(page, "ink"); await chooseInkTool(page, mode); }
    else await chooseMode(page, mode);
    const objectState = () => paper.locator('[data-testid^="notebook-ink-"], [data-testid^="notebook-stamp-"]').evaluateAll((nodes) =>
      nodes.map((node) => ({ id: node.getAttribute("data-testid"), paths: [...node.querySelectorAll("path")].map((p) => p.getAttribute("d")),
        glyphs: [...node.querySelectorAll("g[transform]")].map((p) => p.getAttribute("transform")) })));
    const before = await objectState();
    const box = (await paper.boundingBox())!;
    const x = box.x + 180, y = box.y + 100;
    const point = (id: number, dx: number, dy: number) => ({ id, x: x + dx, y: y + dy, radiusX: 3, radiusY: 3, force: 1 });
    const transform = await paper.locator("svg > g").first().getAttribute("transform");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(1, 0, 0)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(1, 10, 8)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(1, 10, 8), point(2, 80, 8)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(1, 40, 28), point(2, 110, 28)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [point(2, 110, 28)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(objectState).toEqual(before);
    await expect(paper.getByTestId("notebook-live-ink")).toHaveCount(0);
    await expect(page.getByTestId("notebook-drop-actions")).toHaveCount(0);
    await expect(paper.locator("svg > g").first()).not.toHaveAttribute("transform", transform!);
  }
  await openSettings(page); await page.getByTestId("notebook-save").click();
  await expect(page.getByTestId("web-alert")).toContainText(/Notebook saved|저장했습니다/);
  await closeNotice(page);
  const saved = await latestSavedNotebook(page);
  expect(saved.pages[0].strokes).toHaveLength(1);
  expect(saved.pages[0].stamps).toHaveLength(1);
});

test("vector partial erasing keeps visible stems, tuplets and beams across undo and reopen", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.addInitScript(() => localStorage.setItem("lab_staff_notebooks_v1", JSON.stringify([{
    id: "vector-cuts", title: "Vector cuts", updatedAt: 1,
    settings: { follow: false, lineUnit: "measure", playbackZoom: 1, bpm: 84, random: false, offsetX: 0, offsetY: 0, snap: true, beatsPerMeasure: 4 },
    pages: [{ id: "p", staffCount: 7, strokes: [],
      stamps: [0, 1, 2].map((i) => ({ id: `v${i}`, glyph: "eighth", x: 200 + i * 100, y: 114, size: 26 })),
      tuplets: [{ id: "t", stampIds: ["v0", "v1", "v2"] }] }],
  }])));
  await openNotebook(page); await openSettings(page); await openSaved(page, "Vector cuts");
  await page.getByTestId("notebook-panel-close").click();
  const paper = page.getByTestId("notebook-drawing");
  const beamPoints = await paper.getByTestId("notebook-beam-level-1").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("points")));
  await holdInkTool(page, "erase"); await page.getByTestId("notebook-eraser-partial").click();
  await page.getByTestId("notebook-ink-options-close").click(); await chooseInkTool(page, "erase");
  await paperDrag(page, { x: 200, y: 112 }, { x: 200, y: 118 });
  await expect(paper.getByTestId("notebook-stamp-v0").locator("g[mask]")).toHaveCount(1);
  await expect(paper.getByTestId("notebook-note-stem")).toHaveCount(3);
  await expect(paper.getByTestId("notebook-tuplet-number")).toHaveText("3");
  expect(await paper.getByTestId("notebook-beam-level-1").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("points")))).toEqual(beamPoints);
  await page.screenshot({ path: "generated-artifacts/notebook-vector-partial.png" });
  await page.getByLabel(/^Undo$|^실행 취소$/).click();
  await expect(paper.locator("mask")).toHaveCount(0);
  await page.getByLabel(/^Redo$|^다시 실행$/).click();
  await expect(paper.getByTestId("notebook-stamp-v0").locator("g[mask]")).toHaveCount(1);
  await openSettings(page); await page.getByTestId("notebook-save").click(); await closeNotice(page);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0]);
  expect(saved.pages[0].stamps).toHaveLength(3);
  expect(saved.pages[0].tuplets[0].stampIds).toEqual(["v0", "v1", "v2"]);
  expect(saved.pages[0].stamps[0].erasures).toHaveLength(1);
  await openSaved(page, "Vector cuts"); await page.getByTestId("notebook-panel-close").click();
  await expect(paper.getByTestId("notebook-stamp-v0").locator("g[mask]")).toHaveCount(1);
  await holdInkTool(page, "erase"); await page.getByTestId("notebook-eraser-object").click();
  await page.getByTestId("notebook-ink-options-close").click();
  await paperDrag(page, { x: 200, y: 80 }, { x: 200, y: 90 });
  await expect(paper.getByTestId("notebook-stamp-v0")).toHaveCount(0);
  await page.getByLabel(/^Undo$|^실행 취소$/).click();
  await expect(paper.getByTestId("notebook-stamp-v0").locator("g[mask]")).toHaveCount(1);
});

test("automatic placement moves relatively from a remote touch and snaps live only vertically", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await openNotebook(page); await chooseMode(page, "notes");
  await chooseGlyph(page, "quarter");
  const paper = page.getByTestId("notebook-drawing");
  const position = async () => {
    const transform = await paper.locator("g:has(> ellipse)").first().getAttribute("transform");
    const match = /translate\(([-.\d]+)[ ,]+([-.\d]+)\)/.exec(transform!)!;
    return { x: Number(match[1]), y: Number(match[2]) };
  };
  expect(await position()).toEqual({ x: 55, y: 102 });
  await expect(page.getByTestId("notebook-stamp-confirm")).toHaveCount(0);
  const box = (await paper.boundingBox())!, ratio = box.width / 900;
  await page.mouse.move(box.x + 500 * ratio, box.y + 250 * ratio);
  await page.mouse.down();
  expect(await position()).toEqual({ x: 55, y: 102 });
  await page.mouse.move(box.x + 560 * ratio, box.y + 278 * ratio, { steps: 8 });
  await expect.poll(async () => (await position()).y).toBe(132);
  const live = await position();
  expect(Math.abs(live.x - 115)).toBeLessThan(1 / ratio);
  await page.mouse.up();
  expect(await position()).toEqual(live);
  await expect(page.getByTestId("notebook-drop-actions")).toHaveCount(0);
  await openSettings(page); await page.getByTestId("notebook-snap").click();
  await page.getByTestId("notebook-panel-close").click();
  await paperDrag(page, { x: 500, y: 250 }, { x: 517, y: 259 });
  const free = await position();
  expect(Math.abs(free.y - live.y - 9)).toBeLessThan(1 / ratio);
  expect(free.y % 6).not.toBe(0);
  await chooseGlyph(page, "eighth");
  const transforms = await paper.locator("g:has(> ellipse)").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("transform")));
  const next = /translate\(([-.\d]+)[ ,]+([-.\d]+)\)/.exec(transforms[1]!)!;
  expect(Number(next[2])).toBe(free.y);
  expect(Number(next[1])).toBeCloseTo(free.x + 22);
  await openSettings(page); await page.getByTestId("notebook-save").click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0]);
  expect(saved.pages[0].stamps[0]).toMatchObject(free);
  expect(saved.pages[0].stamps).toHaveLength(2);
  expect(saved.settings.snap).toBe(false);
});

test("relative note movement converts zoom and scroll before snapping", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const reference = {
    ...originalNote, id: "zoom-reference", title: "Zoom reference",
    pages: [{ id: "zoom-page", staffCount: 12, strokes: [], stamps: [{ id: "zoom-note", glyph: "quarter", x: 200, y: 257, size: 26 }] }],
  };
  await page.addInitScript((note) => localStorage.setItem("lab_staff_notebooks_v1", JSON.stringify([note])), reference);
  await openNotebook(page); await openSettings(page);
  await openSaved(page, reference.title); await page.getByTestId("notebook-panel-close").click();
  await chooseMode(page, "ink");
  for (let i = 0; i < 5; i++) await page.getByLabel(/^Zoom in$|^확대$/).click();
  await chooseMode(page, "notes");
  await page.getByTestId("notebook-horizontal-scroll").evaluate((node) => { node.scrollLeft = 90; });
  await page.getByTestId("notebook-vertical-scroll").evaluate((node) => { node.scrollTop = 150; });
  const paper = page.getByTestId("notebook-drawing"), bounds = (await paper.boundingBox())!;
  expect(bounds.width).toBeGreaterThan(1100);
  const ratio = bounds.width / 900;
  await page.mouse.click(bounds.x + 200 * ratio, bounds.y + 257 * ratio);
  await paperDrag(page, { x: 500, y: 350 }, { x: 540, y: 370 });
  await expect(page.getByTestId("notebook-drop-actions")).toHaveCount(0);
  await openSettings(page); await page.getByTestId("notebook-save").click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0]);
  expect(saved.pages[0].stamps[0].y).toBe(275);
  expect(Math.abs(saved.pages[0].stamps[0].x - 240)).toBeLessThan(1 / ratio);
});

for (const viewport of [{ width: 768, height: 1024 }, { width: 844, height: 390 }]) {
  test(`direct note column stays above its origin and cancels on mode change at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openNotebook(page); await chooseMode(page, "notes");
    const origin = (await page.getByTestId("notebook-note-origin").boundingBox())!;
    await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
    await page.mouse.down();
    await expect(page.getByTestId("notebook-note-role-normal")).toBeVisible();
    await expect(page.getByTestId("notebook-rest-origin")).toHaveCount(0);
    await page.mouse.move(origin.x + origin.width / 2, origin.y - 90, { steps: 10 });
    await expect(page.getByTestId("notebook-note-duration-quarter")).toBeVisible();
    const paper = (await page.getByTestId("notebook-paper-stage").boundingBox())!;
    for (const duration of ["whole", "half", "quarter", "eighth", "sixteenth", "thirty_second"]) {
      const row = page.getByTestId(`notebook-note-duration-${duration}`);
      await expect(row).toBeInViewport({ ratio: 1 });
      const bounds = (await row.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(paper.y - 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(origin.y + 1);
    }
    const quarter = (await page.getByTestId("notebook-note-duration-quarter").boundingBox())!;
    await page.mouse.move(quarter.x + quarter.width / 2, quarter.y + quarter.height / 2, { steps: 5 });
    const dotted = (await page.getByTestId("notebook-note-dotted").boundingBox())!;
    const plain = (await page.getByTestId("notebook-note-plain").boundingBox())!;
    expect(dotted.x + dotted.width).toBeLessThanOrEqual(quarter.x + 1);
    expect(plain.x).toBeGreaterThanOrEqual(quarter.x + quarter.width - 1);
    await page.screenshot({ path: `generated-artifacts/note-picker-${viewport.width}x${viewport.height}.png` });
    await page.getByTestId("notebook-right-toggle").focus();
    await page.getByTestId("notebook-right-toggle").press("Enter");
    await page.getByTestId("notebook-mode-ink").focus();
    await page.getByTestId("notebook-mode-ink").press("Enter");
    await page.mouse.up();
    await expect(page.getByTestId("notebook-drawing").locator("ellipse")).toHaveCount(0);
    await chooseMode(page, "notes"); await chooseGlyph(page, "whole");
    await expect(page.getByTestId("notebook-drawing").locator("ellipse")).toHaveCount(1);
    await expect(page.getByTestId("notebook-stamp-confirm")).toHaveCount(0);
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 844, height: 390 }]) {
  test(`rest gestures place once, preserve dots and form conventional tuplets at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openNotebook(page); await chooseMode(page, "notes");
    await page.getByTestId("notebook-tuplet").click();
    await page.getByTestId("notebook-rest-origin").click();
    const paper = page.getByTestId("notebook-drawing");
    await expect(paper.locator('[data-testid^="notebook-stamp-"]')).toHaveCount(1);
    const origin = page.getByTestId("notebook-rest-origin");
    await origin.evaluate((node) => {
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        if (parent.scrollWidth > parent.clientWidth && getComputedStyle(parent).overflowX === "auto") {
          parent.scrollLeft = 24;
          break;
        }
      }
    });
    const box = (await origin.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByTestId("notebook-note-origin")).toHaveCount(0);
    const steady = (await origin.boundingBox())!;
    expect(steady.x).toBeCloseTo(box.x);
    expect(steady.y).toBeCloseTo(box.y);
    await page.mouse.move(box.x + box.width / 2, box.y - 85, { steps: 10 });
    const duration = page.getByTestId("notebook-rest-duration-thirty_second");
    await expect(duration).toBeVisible();
    const row = (await duration.boundingBox())!;
    await page.mouse.move(row.x + row.width / 2 - 18, row.y + row.height / 2, { steps: 8 });
    await expect(page.getByTestId("notebook-rest-dotted")).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `generated-artifacts/rest-picker-${viewport.width}.png` });
    await page.mouse.up();
    await expect(paper.locator('[data-testid^="notebook-stamp-"]')).toHaveCount(2);
    await expect(paper.getByTestId("notebook-rest-dot")).toHaveCount(1);
    await chooseGlyph(page, "quarter");
    await page.getByTestId("notebook-tuplet").click();
    await expect(paper.getByTestId("notebook-tuplet-number")).toHaveText("3");
    await expect(paper.getByTestId("notebook-tuplet-left")).toHaveCount(1);
    await expect(paper.getByTestId("notebook-tuplet-right")).toHaveCount(1);
    await expect(paper.locator('rect[fill="#fff"]')).toHaveCount(0);
    await openSettings(page); await page.getByTestId("notebook-save").click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0]);
    expect(saved.pages[0].stamps).toHaveLength(3);
    expect(saved.pages[0].stamps[0]).toMatchObject({ glyph: "rest-quarter", dotted: false, x: 55, y: 102 });
    expect(saved.pages[0].stamps[1]).toMatchObject({ glyph: "rest-thirty_second", dotted: true });
    expect(saved.pages[0].tuplets[0].stampIds).toHaveLength(3);
    await closeNotice(page); await openSaved(page, saved.title);
    await page.getByTestId("notebook-panel-close").click();
    await expect(paper.getByTestId("notebook-rest-dot")).toHaveCount(1);
    await expect(paper.getByTestId("notebook-tuplet-number")).toHaveText("3");
    if (viewport.width === 844) {
      const cancelBox = (await origin.boundingBox())!;
      await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y - 80, { steps: 8 });
      await page.getByTestId("notebook-right-toggle").focus();
      await page.getByTestId("notebook-right-toggle").press("Enter");
      await page.getByTestId("notebook-mode-ink").focus();
      await page.getByTestId("notebook-mode-ink").press("Enter");
      await page.mouse.up();
      await expect(paper.locator('[data-testid^="notebook-stamp-"]')).toHaveCount(3);
    }
    await page.screenshot({ path: `generated-artifacts/tuplet-notation-${viewport.width}.png` });
  });
}

test("mixed selection previews, cancels, copies and pastes an independent clipboard bundle", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.addInitScript(() => localStorage.setItem("lab_staff_notebooks_v1", JSON.stringify([{
    id: "mixed", title: "Mixed selection", updatedAt: 1,
    settings: { follow: false, followSymbols: false, lineUnit: "measure", playbackZoom: 1, bpm: 120, random: false, offsetX: 0, offsetY: 0, snap: true, rowsPerPage: 4 },
    pages: [{ id: "p", staffCount: 4, strokes: [{ id: "ink", width: 3, points: [{ x: 100, y: 110 }, { x: 140, y: 115 }] }],
      stamps: [{ id: "a", glyph: "quarter", x: 200, y: 102, size: 26 }, { id: "b", glyph: "eighth", x: 260, y: 102, size: 26 }, { id: "sharp", glyph: "sharp", x: 180, y: 102, size: 26, attachTo: "a" }],
      tuplets: [{ id: "t", stampIds: ["a", "b"] }] }],
  }])));
  await openNotebook(page); await openSettings(page); await openSaved(page, "Mixed selection");
  await page.getByTestId("notebook-panel-close").click();
  await chooseMode(page, "select");
  await paperDrag(page, { x: 70, y: 50 }, { x: 310, y: 145 });
  await expect(page.getByTestId("notebook-drawing").locator('rect[stroke="#a36f36"]')).toHaveCount(3);
  await page.getByTestId("notebook-clipboard-save").click();
  await paperDrag(page, { x: 200, y: 102 }, { x: 440, y: 257 });
  await expect(page.getByTestId("notebook-drop-copy")).toBeVisible();
  await page.getByTestId("notebook-drop-cancel").click();
  await expect(page.getByTestId("notebook-drop-actions")).toHaveCount(0);
  await paperDrag(page, { x: 200, y: 102 }, { x: 440, y: 257 });
  await page.getByTestId("notebook-drop-copy").click();
  await page.getByLabel(/^Clear selection$|^선택 지우기$/).click();
  const originalBox = (await page.getByTestId("notebook-drawing").boundingBox())!;
  await page.mouse.click(originalBox.x + 200 * originalBox.width / 900, originalBox.y + 102 * originalBox.width / 900);
  await expect(page.getByTestId("notebook-drawing").locator('rect[stroke="#a36f36"]')).toHaveCount(2);
  await paperDrag(page, { x: 70, y: 50 }, { x: 310, y: 145 });
  await paperDrag(page, { x: 200, y: 102 }, { x: 300, y: 257 });
  await page.getByTestId("notebook-drop-move").click();
  await page.getByTestId("notebook-clipboard-tab").click();
  await page.locator('[data-testid^="notebook-paste-"]').click();
  const box = (await page.getByTestId("notebook-drawing").boundingBox())!;
  await page.mouse.click(box.x + 200 * box.width / 900, box.y + 420 * box.width / 900);
  await page.getByTestId("notebook-drop-move").click();
  await openSettings(page); await page.getByTestId("notebook-save").click();
  await expect(page.getByTestId("web-alert")).toContainText(/Notebook saved|저장했습니다/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0]);
  expect(saved.pages[0].strokes).toHaveLength(3);
  expect(saved.pages[0].stamps).toHaveLength(9);
  expect(saved.pages[0].tuplets).toHaveLength(3);
  expect(new Set(saved.pages[0].stamps.map((s: { id: string }) => s.id)).size).toBe(9);
  expect(Math.abs(saved.pages[0].stamps.find((s: { id: string }) => s.id === "a").x - 300)).toBeLessThan(900 / originalBox.width);
  expect(saved.pages[0].stamps.find((s: { id: string }) => s.id === "a").y).toBeCloseTo(257, 0);
  expect(Math.abs(saved.pages[0].stamps.find((s: { id: string }) => s.id === "b").x - 360)).toBeLessThan(900 / originalBox.width);
  for (const group of saved.pages[0].tuplets) {
    const [a, b] = group.stampIds.map((id: string) => saved.pages[0].stamps.find((s: { id: string }) => s.id === id));
    expect(b.x - a.x).toBeCloseTo(60);
    expect(b.y).toBe(a.y);
  }
});

test("staged note gesture preserves strong and dotted choices; tuplets count notes and rests equally", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openNotebook(page); await chooseMode(page, "notes");
  await expect(page.getByTestId("notebook-play")).toBeInViewport({ ratio: 1 });
  await page.getByTestId("notebook-tuplet").click();
  const box = (await page.getByTestId("notebook-note-origin").boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await expect(page.getByTestId("notebook-note-role-strong")).toBeVisible();
  const strong = (await page.getByTestId("notebook-note-role-strong").boundingBox())!;
  await page.mouse.move(strong.x + strong.width / 2, y, { steps: 8 });
  await page.mouse.move(x + 60, y - 90, { steps: 8 });
  const quarter = (await page.getByTestId("notebook-note-duration-quarter").boundingBox())!;
  await page.mouse.move(quarter.x + quarter.width / 2 - 16, quarter.y + quarter.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId("notebook-stamp-confirm")).toHaveCount(0);
  await chooseGlyph(page, "whole");
  await chooseGlyph(page, "rest-eighth");
  await page.getByTestId("notebook-tuplet").click();
  await expect(page.getByTestId("notebook-drawing").locator("text").filter({ hasText: /^3$/ })).toHaveCount(1);
  await chooseGlyph(page, "sharp");
  await openSettings(page); await page.getByTestId("notebook-save").click();
  await expect(page.getByTestId("web-alert")).toContainText(/Notebook saved|저장했습니다/);
  const saved = await latestSavedNotebook(page);
  const stamps = saved.pages[0].stamps ?? [];
  expect(stamps[0]).toMatchObject({ glyph: "quarter", role: "strong", dotted: true });
  expect(stamps[1]).toMatchObject({ glyph: "whole", role: "normal", dotted: false });
  expect(saved.pages[0].tuplets?.[0].stampIds).toHaveLength(3);
  expect(stamps[3].attachTo).toBe(stamps[1].id);
  await closeNotice(page); await openSaved(page, saved.title);
  await page.getByTestId("notebook-panel-close").click();
  await expect(page.getByTestId("notebook-drawing").locator("text").filter({ hasText: /^3$/ })).toHaveCount(1);
  await page.screenshot({ path: "generated-artifacts/notebook-notes-phone.png" });
});

test("landscape playback bar keeps meter, tempo and Stop when collapsed; rows survive rotation", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openNotebook(page); await openSettings(page); await rowsTo(page, 2);
  await page.getByTestId("notebook-panel-close").click();
  await page.getByTestId("notebook-meter").click(); await page.getByTestId("notebook-meter-4").click();
  await page.getByTestId("notebook-bpm").fill("200"); await page.getByTestId("notebook-bpm").press("Enter");
  await page.getByTestId("notebook-play").click();
  await expect(page.getByTestId("notebook-play")).toHaveAttribute("aria-label", /Stop|정지/, { timeout: 30000 });
  await page.getByTestId("notebook-playback-collapse").click();
  await expect(page.getByTestId("notebook-bpm")).toHaveCount(0);
  await expect(page.getByTestId("notebook-play")).toHaveAttribute("aria-label", /Stop|정지/);
  await page.getByTestId("notebook-playback-collapse").click();
  await expect(page.getByTestId("notebook-meter")).toContainText("4/4");
  await expect(page.getByTestId("notebook-bpm")).toHaveValue("200");
  await page.getByTestId("notebook-play").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("notebook-drawing").locator('line[stroke="#141414"]')).toHaveCount(10);
  await page.screenshot({ path: "generated-artifacts/notebook-portrait-rows.png" });
});

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
  await chooseMode(page, "notes");
  await page.getByTestId("notebook-note-origin").focus();
  await page.getByTestId("notebook-note-origin").press("Enter");
  for (const glyph of ["whole", "half", "quarter", "eighth", "sixteenth", "thirty_second"]) {
    await expect(page.getByTestId(`notebook-note-duration-${glyph}`).locator("svg")).toHaveCount(1);
  }
  await page.screenshot({ path: "/tmp/notebook-standard-palette-verified.png" });
  await page.getByTestId("notebook-note-duration-quarter").click();
  await expect(page.getByTestId("notebook-stamp-confirm")).toHaveCount(0);
  await openSettings(page);
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

test("phone imports real pattern, starts audio, stops on settings edits, and places symbols immediately", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openNotebook(page);
  await chooseMode(page, "notes");
  await chooseGlyph(page, "sharp");
  await expect(page.getByTestId("notebook-stamp-cancel")).toHaveCount(0);
  await openSettings(page);
  await page.getByText(/^패턴 불러오기$|^Load pattern$/).click();
  await page.getByText("Notebook 4/4 reference").click();
  await page.getByTestId("notebook-play").click();
  await expect(page.getByTestId("notebook-play")).toHaveAttribute("aria-label", /정지|Stop/, { timeout: 30000 });
  await page.getByTestId("notebook-line-unit-phrase").click();
  await expect(page.getByTestId("notebook-play")).toHaveAttribute("aria-label", /재생|Play/);
  await page.getByTestId("notebook-save").click();
  await expect.poll(() => page.evaluate(() => {
    const notes = JSON.parse(localStorage.getItem("lab_staff_notebooks_v1") ?? "[]");
    return notes[0]?.settings?.source?.id;
  })).toBe("notebook-test-pattern");
  const notes = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!));
  expect(notes[0].pages[0].stamps).toHaveLength(1);
  expect(notes[0].pages[0].stamps[0].glyph).toBe("sharp");
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
  await openSettings(page);
  await openSaved(page, "Follow reference");
  // Saving first makes viewport padding explicit; playback must not reorder this document.
  await page.getByTestId("notebook-save").click();
  await closeNotice(page);
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0].pages);
  await page.getByTestId("notebook-play").click();
  await expect(page.getByTestId("notebook-play")).toHaveAttribute("aria-label", /정지|Stop/, { timeout: 30000 });
  await page.getByTestId("notebook-panel-close").click();
  await expect.poll(() => page.getByTestId("notebook-horizontal-scroll").evaluate((node) => node.scrollLeft)).toBe(0);
  await expect.poll(() => page.getByTestId("notebook-vertical-scroll").evaluate((node) => node.scrollTop)).toBeGreaterThan(50);
  await page.screenshot({ path: "/tmp/notebook-follow-verified.png" });
  await openSettings(page);
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
    const scope = window as typeof window & { __notebookSources: { loop: boolean; ended: boolean }[] };
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
  await openSettings(page);
  await openSaved(page, "Continuous reference");
  await page.getByTestId("notebook-play").click();
  await expect(page.getByTestId("notebook-play")).toHaveAttribute("aria-label", /정지|Stop/, { timeout: 30000 });
  // Viewport-filling rows extend this phone sheet to <4 seconds at BPM300.
  // The click must continue even after the complete padded sheet.
  await page.waitForTimeout(4000);
  await expect(page.getByTestId("notebook-play")).toHaveAttribute("aria-label", /정지|Stop/);
  expect(await page.evaluate(() => (window as typeof window & { __notebookSources: { loop: boolean; ended: boolean }[] })
    .__notebookSources.some((source) => source.loop && !source.ended))).toBe(true);
  await page.getByTestId("notebook-play").click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __notebookSources: { loop: boolean; ended: boolean }[] })
    .__notebookSources.filter((source) => source.loop && !source.ended).length)).toBe(0);
  await page.getByTestId("notebook-play").click();
  await expect(page.getByTestId("notebook-play")).toHaveAttribute("aria-label", /정지|Stop/);
  await page.getByTestId("notebook-panel-close").click();
  await page.getByTestId("notebook-close").click();
  await expect(page.getByTestId("notebook-drawing")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __notebookSources: { loop: boolean; ended: boolean }[] })
    .__notebookSources.filter((source) => source.loop && !source.ended).length)).toBe(0);
});

test("phone lower visible rows accept symbol-only edits and preserve their saved positions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openNotebook(page);
  await openSettings(page);
  await rowsTo(page, 12);
  await page.getByTestId("notebook-panel-close").click();
  await chooseMode(page, "notes");
  await chooseGlyph(page, "quarter");
  await page.getByTestId("notebook-vertical-scroll").evaluate((node) => { node.scrollTop = 200; });
  const box = (await page.getByTestId("notebook-drawing").boundingBox())!;
  const targetY = 9 * 155 + 102;
  const startY = (300 - box.y) / (box.width / 900);
  for (let i = 0; i < 3; i++) await paperDrag(page, { x: 500, y: startY }, { x: 500, y: startY + 3 * 155 });
  await openSettings(page);
  await page.getByTestId("notebook-save").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1") ?? "[]")[0]?.pages[0]?.stamps?.length)).toBe(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab_staff_notebooks_v1")!)[0]);
  expect(saved.pages[0].staffCount).toBeGreaterThanOrEqual(10);
  expect(saved.pages[0].strokes).toHaveLength(0);
  expect(saved.pages[0].stamps[0].y).toBeCloseTo(targetY, 0);
  await closeNotice(page);
  await openSaved(page, saved.title);
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
const openSaved = (page: Page, title: string) => page.getByLabel(new RegExp(`^Open ${title}$|^${title} 열기$`)).click();
const storedNotes = (page: Page): Promise<StaffNotebook[]> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), notebookKey);
const storedRaw = (page: Page) => page.evaluate((key) => localStorage.getItem(key), notebookKey);
const paperContents = (page: Page) => page.getByTestId("notebook-drawing").locator("svg").evaluate((svg) => {
  const document = svg.cloneNode(true) as SVGElement;
  // Selection is editor state, not saved ink. Loading correctly clears it.
  document.querySelectorAll('path[stroke="#a36f36"], rect[stroke="#a36f36"]').forEach((outline) => outline.remove());
  return document.innerHTML;
});

async function openGuardReference(page: Page) {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.addInitScript(({ key, notes }) => localStorage.setItem(key, JSON.stringify(notes)),
    { key: notebookKey, notes: [originalNote, otherNote] });
  await openNotebook(page);
  await openSettings(page);
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
  await chooseMode(page, "notes");
  await chooseGlyph(page, "quarter");
  await openSettings(page);
  await rowsTo(page, 13);
  await page.getByTestId("notebook-panel-close").click();
  await expect(page.getByTestId("notebook-drawing").locator('line[stroke="#141414"]')).toHaveCount(13 * 5);
  await openSettings(page);
  await titleInput(page).fill(editedTitle);
  await page.getByTestId("notebook-bpm").fill("113");
  await page.getByTestId("notebook-bpm").press("Enter");
  await page.getByTestId("notebook-line-unit-phrase").click();
  await page.getByTestId("notebook-follow").click();
  await page.getByTestId("notebook-random").click();
  await page.getByLabel(/^Decrease playback zoom$|^재생 확대 축소$/).click();
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
  if (path === "exit") await openSettings(page);
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
    await openSettings(page);
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
    ...DEFAULT_NOTEBOOK_SETTINGS, ...originalNote.settings, bpm: 113, follow: true, random: true, lineUnit: "phrase", playbackZoom: 0.75, rowsPerPage: 13,
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
  await openSettings(page);
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
        if (change === "mark") {
          await chooseMode(page, "notes");
          await chooseGlyph(page, "quarter");
        } else {
          await openSettings(page);
          await rowsTo(page, 13);
          await page.getByTestId("notebook-panel-close").click();
        }
        if (change === "mark") {
          // The stamp action closes the drawer.
          await expect(page.getByTestId("notebook-panel-close")).toHaveCount(0);
        }
      }
      await openSettings(page);
    }
    const draft = await paperContents(page);
    for (const path of ["new", "open", "exit"] as const) {
      await requestGuardAction(page, path);
      await page.getByTestId("web-alert-action-0").click();
      if (path === "exit") await openSettings(page);
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
    if (change === "settings") expect(saved.settings).toEqual({ ...DEFAULT_NOTEBOOK_SETTINGS, ...originalNote.settings, follow: true });
  });
}
