import { test, expect, type Frame } from "@playwright/test";
import { installAudioResourceProbe } from "./helpers/audio-resource-probe";

// Six long runs plus twelve short stop/change/restart runs, in one document.
// Override only for local smoke checks; recorded soak uses >= 120 seconds.
const seconds = Number(process.env.COUNT_SOAK_SECONDS ?? 120);
if (!Number.isFinite(seconds) || seconds < 1) throw new Error("Invalid COUNT_SOAK_SECONDS");
test.use({ viewport: { width: 420, height: 860 } });

test("iframe dense count soak: Beat, Bar, Note queue resource plateau and stop silence", async ({ page }, info) => {
  test.setTimeout(6 * seconds * 1000 + 240_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(installAudioResourceProbe);
  await page.addInitScript(() => {
    if (localStorage.getItem("count_soak_seed")) return;
    const pattern = Array(9).fill("normal");
    const rhythm = {
      bpm: 240, beatsPerMeasure: 4, beatTypes: ["strong", "normal", "normal", "normal"],
      beatSubdivisions: Object.fromEntries([0, 1, 2, 3].map(i => [i, pattern])),
      subdivisionPattern: pattern, barRepeats: {}, loopBlocks: [], barLoopMode: "loop",
    };
    const profile = { volume: 0.75, soundSet: "classic", voiceCountLanguage: "en",
      soundSetOverlays: { classic: "tempo" } };
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_settings", JSON.stringify({
      ...rhythm, ...profile,
      modeSettings: Object.fromEntries(["beat", "bar", "note"].map(mode => [mode, profile])),
    }));
    const child = (id: string) => ({ ...rhythm, id, label: id, mode: "bar", createdAt: 1 });
    localStorage.setItem("practice_book", JSON.stringify([
      { ...child("soak-bar"), label: "Soak Bar" },
      { ...child("soak-note"), mode: "note", label: "Soak Note", notePlayMode: "loop",
        noteQueueEntries: [child("soak-child-a"), child("soak-child-b")] },
    ]));
    localStorage.setItem("count_soak_seed", "1");
  });
  await page.route("**/count-soak-host", route => route.fulfill({
    contentType: "text/html",
    body: '<iframe id="app" src="/" allow="autoplay" style="position:fixed;inset:0;width:420px;height:860px;border:0"></iframe>',
  }));
  await page.goto("/count-soak-host", { waitUntil: "domcontentloaded" });
  const app: Frame = page.frames().find(f => f.parentFrame())!;
  await expect(app.getByTestId("play-button")).toBeVisible({ timeout: 60_000 });
  const cdp = await page.context().newCDPSession(page);
  const samples: any[] = [];
  const snapshot = async (label: string) => {
    await cdp.send("HeapProfiler.collectGarbage");
    const heap = await cdp.send("Runtime.getHeapUsage");
    const resources = await app.evaluate(() => (window as any).__audioResources());
    const sample = { label, heapBytes: heap.usedSize, backingBytes: heap.backingStorageSize, ...resources };
    samples.push(sample);
    console.log("COUNT_SOAK", JSON.stringify(sample));
    return sample;
  };
  await page.waitForTimeout(1000);
  const baseline = await snapshot("initial-pools");
  expect(baseline.pcm, "Requires the running Metro development server for cache measurements").toBeDefined();
  const change = async (mode: string, language: string, overlay: string) => {
    await app.getByTestId(`open-${mode}-settings`).click();
    await app.getByText(/^(Sound|사운드)$/).click();
    await app.getByTestId(`voice-count-language-${language}`).click();
    await app.getByTestId("sound-overlay-open-classic").click();
    await app.getByTestId(`sound-overlay-option-${overlay}`).click();
    await app.getByTestId("settings-close").click();
  };
  const load = async (current: string, label: string) => {
    const selectOffset = async (offset: number) => {
      await app.getByTestId("mode-cycle-label").click();
      await page.waitForTimeout(450);
      const deg = (90 - offset * 34) * Math.PI / 180;
      await page.mouse.click(210 + Math.cos(deg) * 104, Math.sin(deg) * 104);
      await page.waitForTimeout(300);
      await page.mouse.click(210, 700);
    };
    // Embedded settings practice lists filter by mode. Use the full library;
    // go via Beat so all selected dial slots are inside the top-wall fan.
    if (current === "bar") await selectOffset(-1);
    await selectOffset(-2);
    await app.getByText(label, { exact: true }).click();
  };
  let current = "beat";
  const hashes = new Map<string, number>();
  const stopped: any[] = [];
  for (const mode of ["beat", "bar", "note"]) {
    if (mode !== "beat") await load(current, mode === "bar" ? "Soak Bar" : "Soak Note");
    current = mode;
    const play = app.getByTestId(mode === "bar" ? "bar-play-button"
      : mode === "note" ? "note-play-button" : "play-button");
    await expect(play).toBeVisible();
    // Bar mounts a pre-existing custom-editor preview pool even while closed.
    // Record it before count playback; do not label those players as a leak.
    await page.waitForTimeout(1000);
    const modeBaseline = await snapshot(`${mode}-initial-pools`);
    expect(modeBaseline.active).toBe(0);
    for (let cycle = 0; cycle < 6; cycle++) {
      // Cross product, then repeat the first two variants to reject stale PCM.
      const language = cycle % 2 ? "ko" : "en";
      const overlay = cycle % 4 < 2 ? "tempo" : "digital";
      await change(mode, language, overlay); // Locked settings only changed stopped.
      await play.click();
      await expect.poll(() => app.evaluate(() => (window as any).__audioResources().loops)).toBe(1);
      const running = await snapshot(`${mode}-${cycle}-${language}-${overlay}-start`);
      expect(running.active).toBe(1); // No simultaneous realtime clicks.
      expect(running.lastDuration).toBeCloseTo(2, 2); // 4 beats at 240, renderer's 2-pass loop.
      const key = `${language}-${overlay}`;
      if (hashes.has(key)) expect(running.lastHash, key).toBe(hashes.get(key));
      else {
        expect([...hashes.values()]).not.toContain(running.lastHash);
        hashes.set(key, running.lastHash);
      }
      const startCount = running.starts;
      const duration = cycle < 2 ? seconds * 1000 : 1500;
      // Sample throughout long runs, not just after a possible cleanup.
      for (let elapsed = 0; elapsed < duration; elapsed += 10_000) {
        await page.waitForTimeout(Math.min(10_000, duration - elapsed));
        // Note queue handoffs intentionally stop the old entry while preparing
        // the next. Require recovery, but do not mistake that gap for a leak.
        if (mode === "note") {
          await expect.poll(() => app.evaluate(() => (window as any).__audioResources().loops)).toBe(1);
        }
        const during = await snapshot(`${mode}-${cycle}-playing-${elapsed}`);
        if (mode === "note") {
          expect(during.loops).toBeLessThanOrEqual(1);
          expect(during.active).toBeLessThanOrEqual(1);
        } else {
          expect(during.loops).toBe(1);
          expect(during.active).toBe(1);
        }
        expect(during.pcm.entries).toBeLessThanOrEqual(16);
        expect(during.pcm.bytes).toBeLessThanOrEqual(8 * 1024 * 1024);
        expect(during.lastHash).toBe(running.lastHash);
        if (mode !== "note") expect(during.starts).toBe(startCount);
      }
      if (mode === "note" && seconds >= 10 && cycle < 2) {
        expect((await snapshot(`note-${cycle}-queue-progress`)).starts).toBeGreaterThan(startCount + 2);
      }
      await play.click();
      await expect.poll(() => app.evaluate(() => (window as any).__audioResources().active)).toBe(0);
      const immediate = await snapshot(`${mode}-${cycle}-stop`);
      await page.waitForTimeout(1600); // Beyond look-ahead and longest speech tail.
      const settled = await snapshot(`${mode}-${cycle}-settled`);
      expect(settled.starts).toBe(immediate.starts); // No delayed producer after stop.
      expect(settled.active).toBe(0);
      expect(settled.playingPlayers).toBe(modeBaseline.playingPlayers);
      expect(settled.players).toBe(modeBaseline.players);
      expect(settled.contexts).toBeLessThanOrEqual(modeBaseline.contexts + 1);
      expect(settled.blobs).toBe(modeBaseline.blobs);
      stopped.push(settled);
    }
  }
  // Compare warmed cohorts, not the deliberately cold initial PCM cache.
  const warm = stopped[3];
  for (const sample of stopped.slice(4)) {
    expect(sample.bufferBytes).toBeLessThanOrEqual(warm.bufferBytes + 256 * 1024);
    expect(sample.buffers).toBeLessThanOrEqual(warm.buffers + 3);
    expect(sample.backingBytes).toBeLessThanOrEqual(warm.backingBytes + 1024 * 1024);
    // Dev React/Metro/UI bookkeeping is not audio memory; tolerate 8 MiB.
    expect(sample.heapBytes).toBeLessThan(warm.heapBytes + 8 * 1024 * 1024);
  }
  expect(stopped.at(-1).maxActive).toBe(1);
  expect(errors).toEqual([]);
  await info.attach("count-audio-resource-samples", {
    body: JSON.stringify({ seconds, baseline, samples }, null, 2), contentType: "application/json",
  });
});
