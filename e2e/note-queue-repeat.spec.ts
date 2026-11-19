import { expect, test, type Page } from "@playwright/test";

test.use({
  baseURL: process.env.SETTINGS_TEST_URL,
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  viewport: { width: 390, height: 844 },
  isMobile: false,
  hasTouch: false,
});
test.setTimeout(90000);

async function selectMode(page: Page, key: "ArrowLeft" | "ArrowRight", count: number) {
  await page.getByTestId("mode-cycle-label").click();
  for (let i = 0; i < count; i++) await page.keyboard.press(key);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("mode-dial-touch-frame")).toHaveCount(0);
}

test("saved Beat and looping Bar entries wait for Next while a one-pass Bar advances automatically", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
    localStorage.setItem("metronome_language", "en");
    // Only seed on initial navigation so the saved Note entry survives reload.
    if (localStorage.getItem("test_note_repeat_seeded")) return;
    localStorage.setItem("test_note_repeat_seeded", "1");
    const common = {
      createdAt: 1, bpm: 240, beatsPerMeasure: 2, beatTypes: ["strong", "normal"],
      beatSubdivisions: {}, subdivisionPattern: ["accent"], barRepeats: {}, barLoopMode: "once",
    };
    localStorage.setItem("practice_book", JSON.stringify([
      { ...common, id: "legacy-beat", label: "Legacy Beat", mode: "beat" },
      { ...common, id: "looping-bar", label: "Looping Bar", mode: "bar", barLoopMode: "loop",
        blockPlayMode: "sequential", loopBlocks: [{ startBeat: 0, endBeat: 1, type: "count", value: 2 }],
        barRepeats: { 1: { type: "count", value: 1, isEnd: true } } },
      { ...common, id: "one-pass-bar", label: "One-pass Bar", mode: "bar", bpm: 80 },
    ]));
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60000 });
  await selectMode(page, "ArrowRight", 2);
  await page.getByTestId("load-note-practice-sources").click();
  for (const label of ["Legacy Beat", "Looping Bar", "One-pass Bar"]) {
    await page.getByRole("checkbox", { name: new RegExp(label) }).click();
  }
  await page.getByRole("button", { name: "Load selected" }).click();
  const source = page.getByTestId("note-queue-source");
  for (const label of ["Legacy Beat", "Looping Bar", "One-pass Bar", "Legacy Beat"]) {
    await source.getByText(label, { exact: true }).click();
  }
  async function checkQueue() {
    for (const index of [0, 1, 3]) {
      const item = page.getByTestId(`note-queue-item-${index}`);
      await expect(item.getByText("Repeat until Next")).toBeAttached();
      await expect(item).toHaveCSS("border-top-style", "dashed");
    }
    const once = page.getByTestId("note-queue-item-2");
    await expect(once).toContainText("One-pass Bar");
    await expect(once.getByText("Repeat until Next")).toHaveCount(0);
  }
  await checkQueue();
  await page.getByTestId("save-note-mode").click();
  const savedId = await expect.poll(() => page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (!key.endsWith("practice_book")) continue;
      const rows = JSON.parse(localStorage.getItem(key) ?? "[]");
      const saved = rows.find((row: any) => row.mode === "note" && row.noteQueueEntries?.length === 4);
      if (saved?.noteQueueEntries.map((entry: any) => entry.barLoopMode).join(",") === "loop,loop,once,loop") return saved.id;
    }
    return null;
  })).not.toBeNull().then(() => page.evaluate(() => {
    return Object.keys(localStorage).filter(key => key.endsWith("practice_book"))
      .flatMap(key => JSON.parse(localStorage.getItem(key) ?? "[]"))
      .find((row: any) => row.mode === "note")?.id as string;
  }));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60000 });
  await selectMode(page, "ArrowLeft", 2);
  const practice = page.getByTestId("practice-book-screen");
  await expect(practice).toBeVisible();
  const savedCard = practice.getByTestId(`practice-grid-${savedId}`);
  if (!await savedCard.isVisible()) await page.getByTestId("practice-view-toggle").click();
  await savedCard.click();
  await checkQueue();

  const current = page.getByTestId("note-current-entry");
  const next = page.getByTestId("note-next-entry");
  await page.getByTestId("note-play-button").click();
  await expect(current).toContainText("Legacy Beat");
  await page.waitForTimeout(1200); // More than two complete Beat passes.
  await expect(current).toContainText("Legacy Beat");
  await next.click();
  await expect(current).toContainText("Looping Bar");
  await page.waitForTimeout(2100); // Two passes including the nested END marker.
  await expect(current).toContainText("Looping Bar");
  await next.click({ delay: 650 });
  await expect(current).toContainText("One-pass Bar");
  await expect(current).toContainText("Legacy Beat", { timeout: 8000 });
  await page.waitForTimeout(700);
  await expect(current).toContainText("Legacy Beat");
  await page.getByTestId("note-play-button").click();
  await expect(current).toHaveCount(0);
});
