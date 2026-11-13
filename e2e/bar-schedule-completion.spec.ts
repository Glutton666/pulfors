import { test, expect } from "@playwright/test";

test.use({
  baseURL: process.env.NOTEBOOK_TEST_URL || "http://localhost:8081",
  viewport: { width: 1366, height: 768 },
  isMobile: false,
  hasTouch: false,
});

for (const blockType of ["none", "count", "duration"] as const) {
test(`Desktop Bar ${blockType} schedule completes without crashing the page`, async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript((blockType) => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
    localStorage.setItem("metronome_language", "en");
    localStorage.setItem("metronome_activity_settings", JSON.stringify({ loggingEnabled: true }));
    localStorage.setItem("practice_book", JSON.stringify([{
      id: "completion-test", label: "Completion test", mode: "bar", createdAt: 1,
      bpm: 60, beatsPerMeasure: 4, beatTypes: ["strong", "normal", "normal", "normal"],
      beatSubdivisions: { "0": ["strong", "normal"], "1": ["normal", "normal"] },
      subdivisionPattern: ["normal"], barRepeats: {}, barLoopMode: "once",
      blockPlayMode: "sequential",
      loopBlocks: blockType === "none" ? [] : [
        { startBeat: 0, endBeat: 1, type: blockType, value: blockType === "count" ? 2 : 4 },
      ],
    }]));
  }, blockType);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60000 });
  await page.getByTestId("mode-cycle-label").click();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await page.getByText("Completion test", { exact: true }).click();
  const play = page.getByTestId("bar-play-button");
  await expect(play).toBeVisible();
  await page.evaluate(() => { (window as any).__completionDocument = "preserved"; });
  await play.click();
  await expect(play).toHaveAttribute("aria-label", "Stop");
  await expect(play).toHaveAttribute("aria-label", "Play", { timeout: 15000 });
  expect(errors).toEqual([]);
  await expect(play).toBeVisible();
  expect(await page.evaluate(() => (window as any).__completionDocument)).toBe("preserved");
  // A finished schedule must be restartable in the same document.
  await play.click();
  await expect(play).toHaveAttribute("aria-label", "Stop");
  await expect(play).toHaveAttribute("aria-label", "Play", { timeout: 15000 });
  expect(errors).toEqual([]);
  await expect(play).toBeVisible();
});
}
