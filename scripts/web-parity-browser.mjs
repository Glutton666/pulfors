import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

/** Optional real-browser checks for web workflows (fresh browser storage only). */
export async function verifyWebDialogs(page) {
  await page.locator('[data-testid="open-beat-settings"]').click();
  await page.getByText(/^Keyboard$/, { exact: true }).click();
  await page.getByText("Add Normal Beat", { exact: true }).click();
  await page.waitForTimeout(150);
  await page.keyboard.press("F9");
  await page.getByText("F9", { exact: true }).waitFor();
  await page.getByText("Reset All", { exact: true }).click();
  await page.locator('[data-testid="web-alert"]').waitFor();
  await page.locator('[data-testid="web-alert-action-0"]').click();
  if (!await page.getByText("F9", { exact: true }).count()) throw new Error("Cancel reset modified bindings.");
  await page.getByText("Reset All", { exact: true }).click();
  await page.locator('[data-testid="web-alert-action-1"]').click();
  await page.getByText("N", { exact: true }).waitFor();
  if (await page.getByText("F9", { exact: true }).count()) throw new Error("Confirm reset did not restore bindings.");
  await page.keyboard.press("Escape");
  console.log("Web dialog smoke passed: rebinding, reset cancel, and reset confirmation.");
}

export async function seedBackupAudio(page) {
  await page.evaluate(() => {
    const makeWave = (frequency) => {
      const samples = 4800;
      const buffer = new ArrayBuffer(44 + samples * 2);
      const data = new DataView(buffer);
      const text = (offset, value) => [...value].forEach((c, i) => data.setUint8(offset + i, c.charCodeAt(0)));
      text(0, "RIFF"); data.setUint32(4, 36 + samples * 2, true);
      text(8, "WAVE"); text(12, "fmt ");
      data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
      data.setUint32(24, 48000, true); data.setUint32(28, 96000, true);
      data.setUint16(32, 2, true); data.setUint16(34, 16, true);
      text(36, "data"); data.setUint32(40, samples * 2, true);
      for (let i = 0; i < samples; i++) data.setInt16(44 + i * 2, Math.sin(i * frequency * Math.PI * 2 / 48000) * 4000, true);
      return buffer;
    };
    const first = makeWave(440);
    const second = makeWave(660);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(second)));
    window.__expectedBackupAudio = [
      btoa(String.fromCharCode(...new Uint8Array(first))), base64,
    ];
    localStorage.setItem("@note_samples", JSON.stringify({
      "0": `${URL.createObjectURL(new Blob([first], { type: "audio/wav" }))}#s=0.01&e=0.09`,
      "1": `data:audio/wav;base64,${base64}`,
    }));
  });
}

export async function openGlobalMenu(page) {
  await page.locator('[data-testid="mode-cycle-label"]').click();
  await page.waitForTimeout(400);
  await page.mouse.click(page.viewportSize().width / 2 - 58, 86);
  await page.waitForTimeout(300);
  await page.mouse.click(page.viewportSize().width / 2, page.viewportSize().height * 0.75);
  await page.locator('[data-testid="menu-profile"]').waitFor();
}

/** Navigate the actual shared URL; do not inject pending imports or invoke handlers. */
export async function verifyPracticeAndActivity(page, baseUrl) {
  const entry = { label: "browser-parity-practice", bpm: 137, mode: "beat",
    beatsPerMeasure: 4, beatTypes: ["strong", "normal", "normal", "normal"] };
  const link = `${baseUrl}/practice?d=${encodeURIComponent(Buffer.from(JSON.stringify(entry)).toString("base64"))}`;
  const book = () => page.evaluate(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]"));
  const originalBook = await book();
  await page.goto(link);
  const alert = page.locator('[data-testid="web-alert"]');
  await alert.waitFor();
  if (await alert.locator('[data-testid^="web-alert-action-"]').count() !== 3) {
    throw new Error("Shared link did not offer cancel/apply/save-and-apply.");
  }
  await page.locator('[data-testid="web-alert-action-0"]').click();
  await alert.waitFor({ state: "hidden" });
  if (JSON.stringify(await book()) !== JSON.stringify(originalBook)) throw new Error("Link cancel saved a practice.");
  await page.goto(link);
  await page.locator('[data-testid="web-alert-action-1"]').click();
  await alert.waitFor({ state: "hidden" });
  await page.locator('[data-testid="bpm-display"]').filter({ hasText: /^137$/ }).waitFor();
  if (JSON.stringify(await book()) !== JSON.stringify(originalBook)) throw new Error("Apply-only saved a practice.");
  await page.goto(link);
  await page.locator('[data-testid="web-alert-action-2"]').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("practice_book") ?? "[]")
    .some((entry) => entry.label === "browser-parity-practice"));
  await page.locator('[data-testid="web-alert-action-0"]').click();
  await alert.waitFor({ state: "hidden" });
  await page.locator('[data-testid="bpm-display"]').filter({ hasText: /^137$/ }).waitFor();
  await page.locator('[data-testid="open-beat-settings"]').click();
  await page.getByText("Practice", { exact: true }).click();
  await page.locator('[data-testid="practice-view-toggle"]').click();
  const saved = (await book()).find((item) => item.label === entry.label);
  const card = page.locator(`[data-testid="practice-grid-${saved.id}"]`);
  const longPress = async () => {
    await card.scrollIntoViewIfNeeded();
    const bounds = await card.boundingBox();
    await page.mouse.move(bounds.x + 15, bounds.y + bounds.height / 2);
    await page.mouse.down();
    try { await page.waitForTimeout(650); } finally { await page.mouse.up(); }
    await alert.waitFor();
  };
  await longPress();
  if (await alert.locator('[data-testid^="web-alert-action-"]').count() !== 4) {
    throw new Error("Grid long press did not show all four actions.");
  }
  await page.locator('[data-testid="web-alert-action-3"]').click();
  await alert.waitFor({ state: "hidden" });
  if (!(await book()).some((item) => item.id === saved.id)) throw new Error("Grid cancel deleted practice.");
  await longPress();
  await page.keyboard.press("Escape");
  await alert.waitFor({ state: "hidden" });
  if (!(await book()).some((item) => item.id === saved.id)) throw new Error("Grid Escape deleted practice.");
  await longPress();
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-testid="web-alert-action-0"]').click();
  const download = await downloadPromise;
  const shared = JSON.parse(await readFile(await download.path(), "utf8"));
  if (shared.entry?.id !== saved.id || shared.entry?.bpm !== entry.bpm) {
    throw new Error("Grid share downloaded the wrong practice.");
  }
  await longPress();
  await page.locator('[data-testid="web-alert-action-1"]').click();
  await page.locator('[data-testid="export-cancel-btn"]').click();
  await page.locator('[data-testid="export-cancel-btn"]').waitFor({ state: "hidden" });
  // AnimatedModal retains the outgoing overlay until its exit animation ends.
  await page.waitForTimeout(350);
  await longPress();
  await page.locator('[data-testid="web-alert-action-2"]').click();
  await page.locator('[data-testid="web-alert-action-0"]').click();
  if (!(await book()).some((item) => item.id === saved.id)) throw new Error("Grid delete cancel removed practice.");
  await longPress();
  await page.locator('[data-testid="web-alert-action-2"]').click();
  await page.locator('[data-testid="web-alert-action-1"]').click();
  await page.waitForFunction((id) => !JSON.parse(localStorage.getItem("practice_book") ?? "[]")
    .some((item) => item.id === id), saved.id);
  await page.keyboard.press("Escape");

  // Fixtures establish existing records; deletion itself goes through the UI.
  await page.evaluate(() => {
    localStorage.setItem("metronome_activity_settings", JSON.stringify({ loggingEnabled: true }));
    localStorage.setItem("metronome_activity_log", JSON.stringify([{
      id: "browser-parity-log", type: "practice_session", timestamp: Date.now(),
      data: { bpm: 137, mode: "dial", duration: 60 },
    }]));
    localStorage.setItem("metronome_goals", JSON.stringify([{
      id: "browser-parity-goal", type: "total_play_time", target: 10, label: "Parity goal",
    }]));
  });
  await page.goto(baseUrl);
  await page.locator('[data-testid="mode-cycle-label"]').waitFor();
  await openGlobalMenu(page);
  await page.locator('[data-testid="menu-work-up"]').click();
  const clear = page.getByRole("button", { name: "Delete activity records", exact: true });
  await clear.click();
  await page.locator('[data-testid="web-alert-action-0"]').click();
  const retained = await page.evaluate(() =>
    localStorage.getItem("metronome_activity_log")?.includes("browser-parity-log") &&
    localStorage.getItem("metronome_goals")?.includes("browser-parity-goal"));
  if (!retained) throw new Error("Activity deletion cancel removed records.");
  await clear.click();
  await page.locator('[data-testid="web-alert-action-1"]').click();
  await page.waitForFunction(() => ["metronome_activity_log", "metronome_goals", "metronome_activity_settings"]
    .every((key) => localStorage.getItem(key) === null));
  await page.keyboard.press("Escape");
  await page.goto(baseUrl);
  await page.locator('[data-testid="mode-cycle-label"]').waitFor();
  console.log("Web parity passed: shared-link cancel/apply/save, grid long press/share/export/cancel/Escape/delete, activity delete cancel/confirm.");
}

export async function verifyRestoredAudio(page) {
  const result = await page.evaluate(async () => {
    const samples = JSON.parse(localStorage.getItem("@note_samples") ?? "{}");
    const uris = Object.values(samples);
    if (uris.length !== 2 || uris.some((uri) => !uri.startsWith("data:audio/wav;base64,"))) {
      throw new Error("Audio was not restored to persistent web data URLs.");
    }
    if (!samples["0"].endsWith("#s=0.01&e=0.09")) throw new Error("Trim metadata was lost.");
    const context = new AudioContext();
    try {
      const durations = [];
      const crossings = [];
      for (const uri of uris) {
        const bytes = await (await fetch(uri.split("#")[0])).arrayBuffer();
        const audio = await context.decodeAudioData(bytes);
        durations.push(audio.duration);
        const pcm = audio.getChannelData(0);
        crossings.push(pcm.reduce((n, value, i) => n + (i > 0 && pcm[i - 1] <= 0 && value > 0 ? 1 : 0), 0));
      }
      if (durations.some((d) => Math.abs(d - 0.1) > 0.001)) throw new Error("Restored audio bytes did not decode correctly.");
      if (uris[0] === uris[1]) throw new Error("Distinct recordings were merged.");
      if (Math.abs(crossings[0] - 44) > 1 || Math.abs(crossings[1] - 66) > 1) {
        throw new Error(`Decoded recordings have incorrect content: ${crossings}`);
      }
      return { durations, crossings };
    } finally { await context.close(); }
  });
  console.log("Web audio backup smoke passed: two distinct WAVs decode after restore and reload.", result);
}