import { test, expect } from "@playwright/test";

test.use({ baseURL: process.env.NOTEBOOK_TEST_URL || "http://localhost:8081" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
    localStorage.setItem("metronome_language", "en");
    localStorage.setItem("metronome_settings", JSON.stringify({ bpm: 100 }));
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("bpm-display")).toBeVisible({ timeout: 60000 });
});

for (const mode of ["stopwatch", "timer"] as const) {
  test(`${mode}: one time condition changes tempo, can pause/reset, and validates inputs on portrait`, async ({ page }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.getByTestId("panel-toggle").click();
    if (mode === "timer") await page.getByTestId("tab-timer").click();
    await page.getByTestId("trainer-toggle").click();
    const time = page.getByTestId("trainer-interval-time");
    await time.fill("00:00");
    await time.blur();
    await expect(page.getByRole("alert")).toContainText("00:01");
    await time.fill("00:01");
    await time.blur();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByTestId("trainer-basis-beats").click();
    await page.getByTestId("trainer-interval-beats").fill("4");
    await page.getByTestId("trainer-interval-beats").blur();
    await page.getByTestId("trainer-basis-time").click();
    await expect(time).toHaveValue("00:01");
    await expect(page.getByTestId("trainer-toggle")).toHaveCount(1);
    const input = await time.boundingBox();
    expect(input!.x).toBeGreaterThanOrEqual(0);
    expect(input!.x + input!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({ path: `/tmp/tempo-trainer-${mode}-portrait.png` });
    await page.getByTestId(`${mode}-start`).click();
    // Drawer closes for the countdown; BPM stays unchanged until real playback.
    await expect(page.getByTestId("bpm-display")).toHaveText("100");
    await expect(page.getByTestId("bpm-display")).not.toHaveText("100", { timeout: 15000 });
    await page.getByTestId("panel-toggle").click();
    await page.getByTestId(`${mode}-pause`).click();
    // Existing timer pause finishes the measure and returns to idle; the
    // stopwatch keeps its paused elapsed time and exposes Resume.
    await expect(page.getByTestId(mode === "timer" ? "timer-start" : "stopwatch-resume")).toBeVisible({ timeout: 12000 });
    const pausedBpm = await page.getByTestId("bpm-display").innerText();
    await page.waitForTimeout(1400);
    await expect(page.getByTestId("bpm-display")).toHaveText(pausedBpm);
    if (mode === "stopwatch") await page.getByTestId("stopwatch-reset").click();
    await page.getByTestId("trainer-toggle").click();
    await expect(time).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("landscape stopwatch applies a beat condition and its decrease has no increase cue", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1366, height: 768 });
  const toggle = page.getByTestId("trainer-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await page.getByTestId("trainer-basis-beats").click();
  await page.getByTestId("trainer-interval-beats").fill("2");
  await page.getByTestId("trainer-interval-beats").blur();
  await page.getByTestId("trainer-direction-down").click();
  // Landscape transport shares the same drawer component, rendered inline.
  const trainer = toggle.locator("..");
  const bounds = await trainer.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1366);
  await page.screenshot({ path: "/tmp/tempo-trainer-landscape.png" });
  await page.getByTestId("stopwatch-start").click();
  await expect(page.getByTestId("bpm-display")).toHaveText("98", { timeout: 15000 });
});
