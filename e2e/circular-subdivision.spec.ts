import { test, expect, type Page } from "@playwright/test";

const pattern = ["accent", "normal", "accent", "normal", "accent", "normal", "accent", "normal", "strong"];
test.setTimeout(120000); // Cold Expo/Metro compilation can exceed 30s.
async function seed(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem("circular_e2e_seeded")) {
      localStorage.setItem("metronome_onboarding_done", "1");
      localStorage.setItem("metronome_settings", JSON.stringify({
        bpm: 120, beatsPerMeasure: 4, subdivisions: 1, circularSubdivisionEnabled: true,
        beatTypes: ["strong", "normal", "normal", "normal"], subdivisionPattern: ["accent"],
      }));
      localStorage.setItem("circular_e2e_seeded", "1");
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dial-beat-0")).toBeVisible({ timeout: 60000 });
}
async function hold(page: Page, index: number) {
  const dial = await page.getByTestId("circular-subdivision-dial").boundingBox();
  const dot = await page.getByTestId(`dial-beat-${index}`).boundingBox();
  if (!dial || !dot) throw new Error("Dial geometry missing");
  const cx = dial.x + dial.width / 2, cy = dial.y + dial.height / 2;
  const x = dot.x + dot.width / 2, y = dot.y + dot.height / 2;
  const radius = Math.hypot(x - cx, y - cy);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(page.getByTestId("circular-subdivision-draft")).toBeVisible();
  return { cx, cy, radius, angle: Math.atan2(y - cy, x - cx) };
}
async function radial(page: Page, g: Awaited<ReturnType<typeof hold>>, angle: number, type: string) {
  const radius = g.radius * ({ strong: 1, accent: 0.78, normal: 0.56, mute: 0.34 }[type] ?? 1);
  await page.mouse.move(g.cx + radius * Math.cos(angle), g.cy + radius * Math.sin(angle));
}
async function settings(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("metronome_settings") ?? "{}"));
}

test("real mouse writing ANANANANS commits once to a single beat and restores after reload", async ({ page }) => {
  await seed(page);
  const g = await hold(page, 2);
  await radial(page, g, g.angle, "accent");
  for (let i = 1; i < pattern.length; i++) {
    const angle = g.angle + i * Math.PI / 5 + 0.004;
    await radial(page, g, angle, pattern[i - 1]);
    await radial(page, g, angle, pattern[i]);
  }
  await expect(page.getByTestId("circular-subdivision-draft")).toHaveAttribute("aria-label", "ANANANANS");
  await page.screenshot({ path: "test-results/circular-nine-notes.png" });
  await page.mouse.up();
  await expect(page.getByTestId("circular-subdivision-draft")).toHaveCount(0);
  await expect.poll(async () => (await settings(page)).beatSubdivisions).toEqual({ "2": pattern });
  let stored = await settings(page);
  expect(stored.beatsPerMeasure).toBe(4);
  expect(stored.subdivisionPattern).toEqual(["accent"]);
  expect(stored.beatTypes).toEqual(["strong", "normal", "accent", "normal"]);
  await page.reload();
  await expect(page.getByTestId("dial-beat-2")).toContainText("9");
  await page.getByTestId("open-beat-settings").click();
  await page.getByTestId("circular-subdivision-toggle").click();
  await page.getByTestId("settings-close").click();
  await expect.poll(async () => (await settings(page)).circularSubdivisionEnabled).toBe(false);
  expect((await settings(page)).beatSubdivisions).toEqual({ "2": pattern });
  await page.reload();
  await expect(page.getByTestId("dial-beat-2")).toContainText("9");
  const dot = await page.getByTestId("dial-beat-1").boundingBox();
  if (!dot) throw new Error("Missing dot");
  await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await expect(page.getByTestId("circular-subdivision-draft")).toHaveCount(0);
  await page.mouse.up();
  await page.getByTestId("play-button").click();
  await expect(page.getByTestId("play-button")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("play-button").click();
  await expect(page.getByTestId("play-button")).toHaveAttribute("aria-pressed", "false");
  const play = await page.getByTestId("play-button").boundingBox();
  if (!play) throw new Error("Missing play button");
  await page.mouse.move(play.x + play.width / 2, play.y + play.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(550);
  await page.mouse.up();
  await expect(page.getByPlaceholder(/Name \(e.g.|이름 \(예:/)).toBeVisible();
  await page.getByText(/^(Cancel|취소)$/).click();
  await expect(page.getByTestId("play-button")).toHaveAttribute("aria-pressed", "false");
});

test("radial-only input replaces existing pattern; rotation cancels without saving or playback", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await seed(page);
  let g = await hold(page, 0);
  await radial(page, g, g.angle, "normal");
  await expect(page.getByTestId("circular-subdivision-draft")).toHaveAttribute("aria-label", "N");
  await page.screenshot({ path: "test-results/circular-small-portrait.png" });
  await page.mouse.up();
  await expect.poll(async () => (await settings(page)).beatTypes?.[0]).toBe("normal");
  const before = await settings(page);
  g = await hold(page, 1);
  await radial(page, g, g.angle + Math.PI / 5 + 0.01, "mute");
  await page.setViewportSize({ width: 667, height: 375 });
  await expect(page.getByTestId("circular-subdivision-draft")).toHaveCount(0);
  await page.mouse.up();
  await page.waitForTimeout(600);
  expect((await settings(page)).beatSubdivisions).toEqual(before.beatSubdivisions);
  await expect(page.getByTestId("play-button")).toHaveAttribute("aria-pressed", "false");
  g = await hold(page, 3);
  await radial(page, g, g.angle, "accent");
  await expect(page.getByTestId("circular-subdivision-draft")).toHaveAttribute("aria-label", "A");
  await page.screenshot({ path: "test-results/circular-small-landscape.png" });
  await page.mouse.up();
});

test("web touch supports counterclockwise creation including M on tablet", async ({ page, context }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await seed(page);
  const dial = await page.getByTestId("circular-subdivision-dial").boundingBox();
  const dot = await page.getByTestId("dial-beat-3").boundingBox();
  if (!dial || !dot) throw new Error("Missing touch geometry");
  const cx = dial.x + dial.width / 2, cy = dial.y + dial.height / 2;
  const x = dot.x + dot.width / 2, y = dot.y + dot.height / 2;
  const radius = Math.hypot(x - cx, y - cy), start = Math.atan2(y - cy, x - cx);
  const client = await context.newCDPSession(page);
  const touch = async (type: string, angle: number, r: number) => {
    await client.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] :
      [{ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), id: 1 }] } as any);
  };
  await touch("touchStart", start, radius);
  await expect(page.getByTestId("circular-subdivision-draft")).toBeVisible();
  await touch("touchMove", start, radius * 0.34);
  await touch("touchMove", start - Math.PI / 5 - 0.004, radius * 0.34);
  await touch("touchMove", start - Math.PI / 5 - 0.004, radius);
  await touch("touchMove", start - 2 * Math.PI / 5 - 0.004, radius);
  await touch("touchMove", start - 2 * Math.PI / 5 - 0.004, radius * 0.56);
  await expect(page.getByTestId("circular-subdivision-draft")).toHaveAttribute("aria-label", "MSN");
  await page.screenshot({ path: "test-results/circular-tablet-touch.png" });
  await touch("touchEnd", start, 0);
  await expect.poll(async () => (await settings(page)).beatSubdivisions?.["3"]).toEqual(["mute", "strong", "normal"]);
  expect((await settings(page)).beatTypes).toEqual(["strong", "normal", "normal", "normal"]);
  await expect(page.getByTestId("play-button")).toHaveAttribute("aria-pressed", "false");
});