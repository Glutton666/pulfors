import { test, expect } from "@playwright/test";

test.use({
  baseURL: process.env.NOTEBOOK_TEST_URL || "http://localhost:8081",
  isMobile: false, hasTouch: false,
});

for (const viewport of [
  { name: "portrait", width: 390, height: 844 },
  { name: "landscape", width: 844, height: 390 },
  { name: "tablet", width: 768, height: 1024 },
]) {
  test(`${viewport.name}: playback info follows bars and Stop restores editing`, async ({ page }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem("metronome_onboarding_done", "1");
      localStorage.setItem("metronome_onboarding_lang_done", "1");
      localStorage.setItem("metronome_language", "en");
      localStorage.setItem("practice_book", JSON.stringify([{
        id: "panel-test", label: "Panel test", mode: "bar", createdAt: 1,
        bpm: 80, beatsPerMeasure: 3, beatTypes: ["strong", "normal", "normal"],
        beatSubdivisions: { "0": ["strong", "normal"], "1": ["normal", "normal", "normal"] },
        subdivisionPattern: ["normal"], barLoopMode: "once", blockPlayMode: "sequential",
        barRepeats: {
          0: { type: "count", value: 2, bpm: 80 },
          1: { type: "duration", value: 4, bpm: 120 },
          2: { type: "count", value: 8, bpm: 90 },
        }, loopBlocks: [],
      }]));
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60000 });
    await page.getByTestId("mode-cycle-label").click();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await page.getByText("Panel test", { exact: true }).click();
    const play = page.getByTestId("bar-play-button");
    await expect(play).toBeVisible();
    // No editor selection: playback begins at the first source bar.
    await play.click();
    await expect(page.getByTestId("bar-playback-source")).toHaveText("Playing bar 1");
    await expect(page.getByTestId("bar-playback-bpm")).toContainText("80");
    await expect(page.getByTestId("bar-bpm-minus")).toHaveCount(0);
    await expect(page.getByTestId("bar-save-reset")).toHaveCount(0);
    await expect(page.getByTestId("bar-playback-source")).toHaveText("Playing bar 2", { timeout: 10000 });
    await expect(page.getByTestId("bar-playback-bpm")).toContainText("120");
    await expect(page.getByTestId("bar-playback-repeat")).toContainText("00:04");
    const panel = page.getByTestId("bar-playback-panel");
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    const stopBounds = await play.boundingBox();
    expect(stopBounds!.y).toBeGreaterThanOrEqual(0);
    expect(stopBounds!.y + stopBounds!.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.screenshot({ path: `/tmp/bar-playback-${viewport.name}.png` });
    await play.click();
    await expect(page.getByTestId("bar-editor-panel")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("bar-playback-panel")).toHaveCount(0);
    await expect(page.getByTestId("bar-bpm-plus")).toBeVisible();
    // Select a bar before starting; playback must not move that edit selection.
    await page.getByTestId("bar-row-2").click();
    await expect(page.getByTestId("bar-bpm-value")).toHaveValue("90");
    await play.click();
    await expect(page.getByTestId("bar-playback-source")).toHaveText("Playing bar 3");
    await play.click();
    await expect(page.getByTestId("bar-bpm-value")).toHaveValue("90");
    await expect(page.getByTestId("bar-count-value")).toHaveText("×8");
    expect(errors).toEqual([]);
  });
}
