import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({
  baseURL: process.env.PROFILE_TEST_URL,
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
});
test.setTimeout(120000);

async function prepare(page: Page, language = "en") {
  await page.addInitScript((lang) => {
    if (!localStorage.getItem("local_profiles_v1")) {
      localStorage.setItem("metronome_onboarding_done", "1");
      localStorage.setItem("metronome_onboarding_lang_done", "1");
      localStorage.setItem("metronome_language", lang);
      localStorage.setItem("metronome_settings", JSON.stringify({ bpm: 97, username: "Original", beatsPerMeasure: 4 }));
    }
  }, language);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 90000 });
}
async function openProfiles(page: Page) {
  await page.getByTestId("mode-cycle-label").click();
  const viewport = page.viewportSize()!;
  await page.waitForTimeout(250);
  await page.mouse.click(viewport.width / 2 - 58, 86);
  await page.waitForTimeout(200);
  await page.mouse.click(viewport.width / 2, viewport.height * 0.75);
  await expect(page.getByTestId("menu-profile")).toBeVisible();
  await page.getByTestId("menu-profile").click();
  await expect(page.getByTestId("profile-add")).toBeVisible();
}
async function registry(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("local_profiles_v1")!));
}

test("two profiles create/edit/switch without copied settings; inactive backup and imports never replace existing profiles", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await openProfiles(page);
  await page.getByTestId("profile-add").click();
  await expect(page.getByTestId("profile-name")).toHaveValue("");
  await page.getByTestId("profile-name").fill("Second");
  const photoChooser = page.waitForEvent("filechooser");
  await page.getByTestId("profile-photo").click();
  await (await photoChooser).setFiles({
    name: "profile.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.getByTestId("profile-photo-preview")).toBeVisible();
  await page.getByTestId("primary-instrument-search").fill("violin");
  await page.getByTestId("primary-instrument-violin").click();
  await page.getByTestId("profile-save").click();
  await expect(page.getByTestId("profile-name")).toHaveCount(0);
  let reg = await registry(page);
  const second = reg.profiles.find((p: { id: string }) => p.id !== "legacy").id;
  await expect(page.getByTestId(`profile-row-${second}`)).toContainText("Second");
  await page.getByTestId(`profile-edit-${second}`).click();
  await expect(page.getByTestId("profile-name")).toHaveValue("Second");
  await page.getByTestId("profile-name").fill("Second edited");
  await page.getByTestId("profile-save").click();
  await expect(page.getByTestId(`profile-row-${second}`)).toContainText("Second edited");

  const downloadEvent = page.waitForEvent("download");
  await page.getByTestId(`profile-export-${second}`).click();
  const download = await downloadEvent;
  const contents = await readFile((await download.path())!, "utf8");
  expect(JSON.parse(JSON.parse(contents).data.metronome_settings).bpm).toBe(120);
  expect(Object.keys(JSON.parse(contents).imageFiles)).toHaveLength(1);
  expect((await registry(page)).activeId).toBe("legacy");
  await page.getByTestId(`profile-edit-${second}`).click();
  await page.getByTestId("profile-photo-remove").click();
  await page.getByTestId("profile-save").click();
  await expect(page.getByTestId(`profile-row-${second}`).locator("img")).toHaveCount(0);

  const chooserEvent = page.waitForEvent("filechooser");
  await page.getByTestId("profile-import").click();
  await (await chooserEvent).setFiles({ name: "second.metronome.json", mimeType: "application/json", buffer: Buffer.from(contents) });
  await expect.poll(async () => (await registry(page)).profiles.length).toBe(3);
  reg = await registry(page);
  const restoredId = reg.profiles.find((p: { id: string }) => p.id !== "legacy" && p.id !== second).id;
  await expect(page.getByTestId(`profile-row-${restoredId}`).locator("img")).toBeVisible();
  expect((await registry(page)).activeId).toBe("legacy");
  await page.getByTestId(`profile-select-${second}`).click();
  await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60000 });
  expect((await registry(page)).activeId).toBe(second);
  await openProfiles(page);
  await expect(page.getByTestId(`profile-row-${second}`)).toContainText("Currently selected");

  // A second tab can switch independently while the first tab imports.
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60000 });
  await openProfiles(other);
  const chooserAgain = page.waitForEvent("filechooser");
  await page.getByTestId("profile-import").click();
  await Promise.all([
    (async () => (await chooserAgain).setFiles({ name: "copy.json", mimeType: "application/json", buffer: Buffer.from(contents) }))(),
    other.getByTestId("profile-select-legacy").click(),
  ]);
  await expect.poll(async () => (await registry(page)).profiles.length).toBe(4);
  await expect(other.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("local_profile:legacy:metronome_settings")!).bpm)).toBe(97);
  expect(errors).toEqual([]);
});

for (const [width, height, language] of [[360, 640, "ko"], [667, 375, "en"], [1024, 768, "ko"]] as const) {
  test(`profile draft is accessible at ${width}x${height} in ${language}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await prepare(page, language);
    await openProfiles(page);
    await page.getByTestId("profile-add").click();
    await page.getByTestId("profile-name").fill("Draft");
    await page.getByTestId("profile-save").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("profile-save")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `generated-artifacts/profile-${width}x${height}.jpg` });
    await page.getByTestId("profile-cancel").click();
    await expect(page.getByTestId("profile-add")).toBeVisible();
    expect((await registry(page)).profiles.length).toBe(1);
  });
}
