import { expect, test } from "@playwright/test";

test.use({
  baseURL: process.env.SETTINGS_TEST_URL,
  viewport: { width: 390, height: 844 },
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ["--autoplay-policy=no-user-gesture-required"],
  },
});
test.setTimeout(120000);

test("sensitivity and hierarchical tuning sets persist through note input, capture and cancellation", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
    // A real browser audio graph provides a deterministic synthetic microphone.
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      const context = new AudioContext();
      const tone = context.createOscillator();
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      tone.frequency.value = 440;
      gain.gain.value = 0.2;
      tone.connect(gain).connect(destination);
      tone.start();
      await context.resume();
      return destination.stream;
    } });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60000 });
  const skip = page.getByText(/Skip|건너뛰기/).first();
  if (await skip.isVisible()) await skip.click();
  await page.getByTestId("mode-cycle-label").click();
  await page.waitForTimeout(400);
  await page.mouse.click(390 / 2 - 58, 86);
  await page.waitForTimeout(300);
  await page.mouse.click(195, 600);
  await page.getByRole("menuitem", { name: /시그널 제너레이터|signal generator/i }).click();
  const sensitivity = page.getByTestId("signal-sensitivity-input");
  await expect(sensitivity).toHaveValue("1.0");
  await sensitivity.fill("0.5");
  await sensitivity.press("Enter");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("metronome_signal_sensitivity_v1"))).toBe("0.5");
  await page.getByTestId("signal-tuning-guide").click();
  await page.getByTestId("custom-tuning-add-set").click();
  await page.getByTestId(/^custom-tuning-set-name-/).fill("Drums");
  await page.getByTestId(/^custom-tuning-add-group-/).click();
  await page.getByTestId(/^custom-tuning-group-name-/).fill("Small tom");
  await page.getByTestId(/^custom-tuning-add-target-/).click();
  await page.getByTestId(/^custom-tuning-target-name-/).fill("Bottom head");
  await page.getByTestId(/^custom-tuning-edit-/).click();
  await page.getByTestId("custom-tuning-sets-panel").getByText(/^(Note|음)$/).click();
  await page.getByTestId(/^custom-tuning-frequency-input-/).fill("F#2");
  await page.getByTestId(/^custom-tuning-frequency-apply-/).click();
  await page.getByTestId("custom-tuning-save").click();
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("metronome_custom_tuning_sets_v1") || "[]"));
  await expect.poll(async () => (await stored())[0]?.groups[0]?.targets[0]?.frequency).toBe(92.5);
  await page.getByTestId(/^custom-tuning-detect-/).click();
  await expect(page.getByTestId("tuning-capture-registration")).toBeVisible();
  await expect(page.getByTestId("tuning-capture-save")).toBeEnabled({ timeout: 15000 });
  await page.getByTestId("tuning-capture-save").click();
  await expect(page.getByTestId("custom-tuning-sets-panel")).toBeVisible();
  await expect.poll(async () => (await stored())[0]?.groups[0]?.targets[0]?.frequency).toBeGreaterThan(435);
  const captured = (await stored())[0].groups[0].targets[0].frequency;
  await page.getByTestId(/^custom-tuning-detect-/).click();
  await page.getByTestId("tuning-capture-cancel").click();
  await expect(page.getByTestId("custom-tuning-sets-panel")).toBeVisible();
  expect((await stored())[0].groups[0].targets[0].frequency).toBe(captured);
  for (const viewport of [{ width: 375, height: 667 }, { width: 667, height: 375 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId("custom-tuning-save")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/custom-tuning-guide.png" });
});
