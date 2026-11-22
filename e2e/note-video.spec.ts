import { expect, test } from "@playwright/test";

test.use({
  baseURL: process.env.SETTINGS_TEST_URL,
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  viewport: { width: 390, height: 844 },
});
test.setTimeout(90000);

test("attaches an actual video to a queue item, saves, reloads and syncs playback", async ({ page }) => {
  await page.addInitScript(() => {
    const audioProbe = window as Window & { noteClickTimes?: number[] };
    audioProbe.noteClickTimes = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      const playback = document.querySelector<HTMLVideoElement>('[data-testid="note-video-stage"] video');
      if (playback) audioProbe.noteClickTimes?.push(playback.paused ? -1 : playback.currentTime);
      return start.apply(this, args);
    };
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
    localStorage.setItem("metronome_language", "en");
    if (localStorage.getItem("note_video_seeded")) return;
    localStorage.setItem("note_video_seeded", "1");
    localStorage.setItem("practice_book", JSON.stringify([{
      id: "video-beat", label: "Video Beat", createdAt: 1, mode: "beat", bpm: 120,
      beatsPerMeasure: 2, beatTypes: ["strong", "normal"], beatSubdivisions: {},
      subdivisionPattern: ["accent"], barRepeats: {}, barLoopMode: "once",
    }, {
      id: "plain-beat", label: "Plain Beat", createdAt: 1, mode: "beat", bpm: 240,
      beatsPerMeasure: 2, beatTypes: ["strong", "normal"], beatSubdivisions: {},
      subdivisionPattern: ["accent"], barRepeats: {}, barLoopMode: "once",
    }]));
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60000 });
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 60;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(12);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    return new Promise<number[]>((resolve) => {
      const chunks: BlobPart[] = [];
      let frame = 0;
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const draw = setInterval(() => {
        ctx.fillStyle = frame++ % 2 ? "navy" : "darkgreen";
        ctx.fillRect(0, 0, 80, 60);
      }, 83);
      recorder.onstop = async () => {
        clearInterval(draw);
        stream.getTracks().forEach((t) => t.stop());
        resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));
      };
      recorder.start();
      setTimeout(() => recorder.stop(), 5200);
    });
  });

  const selectMode = async (dir: "ArrowLeft" | "ArrowRight") => {
    await page.getByTestId("mode-cycle-label").click();
    await page.keyboard.press(dir);
    await page.keyboard.press(dir);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("mode-dial-touch-frame")).toHaveCount(0);
  };
  await selectMode("ArrowRight");
  await page.getByTestId("load-note-practice-sources").click();
  await page.getByRole("checkbox", { name: /Video Beat/ }).click();
  await page.getByRole("checkbox", { name: /Plain Beat/ }).click();
  await page.getByRole("button", { name: "Load selected" }).click();
  const source = page.getByTestId("note-queue-source");
  await source.getByText("Video Beat", { exact: true }).click();
  await source.getByText("Plain Beat", { exact: true }).click();
  await page.getByTestId("note-item-video-0").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("note-video-pick").click();
  await (await chooser).setFiles({ name: "practice.webm", mimeType: "video/webm", buffer: Buffer.from(bytes) });
  await expect(page.getByText("practice.webm")).toBeVisible();
  await page.getByTestId("note-video-start").fill("0:00.4");
  await page.getByTestId("note-video-first-beat").fill("0:02");
  await page.getByTestId("note-video-count-1").click();
  await page.getByTestId("note-video-apply").click();
  await page.getByTestId("save-note-mode").click();
  const findSaved = () => page.evaluate(() => Object.keys(localStorage)
    .filter((key) => key.endsWith("practice_book"))
    .flatMap((key) => JSON.parse(localStorage.getItem(key) ?? "[]"))
    .find((row) => row.mode === "note" && row.noteQueueEntries?.[0]?.noteVideo?.startSeconds === 0.4)?.id ?? null);
  await expect.poll(findSaved).not.toBeNull();
  const id = await findSaved();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 60000 });
  await selectMode("ArrowLeft");
  const card = page.getByTestId(`practice-grid-${id}`);
  if (!(await card.isVisible())) await page.getByTestId("practice-view-toggle").click();
  await card.click();
  await expect(page.getByTestId("note-item-video-0")).toHaveAttribute("aria-label", "Edit attached video");
  await page.getByTestId("note-play-button").click();
  const stage = page.getByTestId("note-video-stage");
  const video = stage.locator("video");
  const beat = stage.getByTestId("note-current-beat");
  await expect(stage.getByTestId("note-video-status")).toHaveText(/Count-in/);
  expect(await video.evaluate((v) => (v as HTMLVideoElement).paused)).toBe(true);
  await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).paused)).toBe(false);
  await expect(beat).toHaveText("—");
  await expect(beat).toHaveText(/[12]/, { timeout: 7000 });
  const clickTimes = await page.evaluate(() => (window as Window & { noteClickTimes?: number[] }).noteClickTimes ?? []);
  expect(clickTimes.filter((time) => time === -1)).toHaveLength(2);
  expect(clickTimes.find((time) => time >= 0)).toBeGreaterThan(1.92);
  await stage.getByTestId("note-play-button").click();
  await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).paused)).toBe(true);
  await stage.getByTestId("note-play-button").click();
  await expect.poll(() => video.evaluate((v) => (v as HTMLVideoElement).paused)).toBe(false);
  await stage.getByTestId("note-next-entry").click({ delay: 650 });
  await expect(stage).toHaveCount(0);
  await expect(page.getByTestId("note-current-entry")).toContainText("Plain Beat");
});
