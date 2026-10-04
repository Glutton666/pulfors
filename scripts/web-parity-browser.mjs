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
      return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    };
    localStorage.setItem("@note_samples", JSON.stringify({
      "0": `${makeWave(440)}#s=0.01&e=0.09`,
      "1": makeWave(660),
    }));
  });
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
      for (const uri of uris) {
        const bytes = await (await fetch(uri.split("#")[0])).arrayBuffer();
        const audio = await context.decodeAudioData(bytes);
        durations.push(audio.duration);
      }
      if (durations.some((d) => Math.abs(d - 0.1) > 0.001)) throw new Error("Restored audio bytes did not decode correctly.");
      if (uris[0] === uris[1]) throw new Error("Distinct recordings were merged.");
      return durations;
    } finally { await context.close(); }
  });
  console.log("Web audio backup smoke passed: two distinct WAVs decode after restore and reload.", result);
}