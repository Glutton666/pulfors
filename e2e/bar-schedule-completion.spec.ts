import { test, expect } from "@playwright/test";

test.use({ baseURL: process.env.NOTEBOOK_TEST_URL || "http://localhost:8081" });

test("Bar once schedule completes without unmounting or crashing the page", async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
    localStorage.setItem("metronome_language", "en");
    localStorage.setItem("practice_book", JSON.stringify([{
      id: "completion-test", label: "Completion test", mode: "bar", createdAt: 1,
      bpm: 240, beatsPerMeasure: 2, beatTypes: ["strong", "normal"],
      beatSubdivisions: { "0": ["strong", "normal"], "1": ["normal", "normal"] },
      subdivisionPattern: ["normal"], barRepeats: {}, barLoopMode: "once",
      blockPlayMode: "sequential",
      loopBlocks: [{ startBeat: 0, endBeat: 1, type: "count", value: 2 }],
    }]));
  });
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
