import { test, expect } from "@playwright/test";

test.setTimeout(120000);

// Measures the browser presentation estimate and actual DOM frames in an iframe.
// It does NOT measure physical speakers/Bluetooth. No app timing is monkey-patched.
const cases = [120, 240].flatMap(bpm => [1, 3, 9].map(slots => ({ bpm, slots, volume: 0.75, tone: false })));
cases.push({ bpm: 240, slots: 9, volume: 0.75, tone: true });
// Same 12 slots/second as 240 BPM / 3 slots, independent of density/BPM.
cases.push({ bpm: 120, slots: 6, volume: 0.75, tone: false });
for (const { bpm, slots, volume, tone } of cases) {
  test(`iframe visual probe ${bpm} BPM / ${slots} slots / tone ${tone}`, async ({ page }) => {
    await page.addInitScript(({ bpm, slots, volume, tone }) => {
      localStorage.setItem("metronome_onboarding_done", "1");
      localStorage.setItem("metronome_settings", JSON.stringify({
        bpm, beatsPerMeasure: 4, beatTypes: ["normal", "normal", "normal", "normal"],
        subdivisionPattern: ["accent"], volume,
        soundSetTonePositions: tone ? { classic: { x: 0.2, y: 0.2 } } : {},
        beatSubdivisions: slots > 1 ? Object.fromEntries([0, 1, 2, 3].map(i => [i, Array(slots).fill("normal")])) : {},
      }));
      const starts: any[] = [];
      const frames: any[] = [];
      const commits: any[] = [];
      (window as any).__visualProbe = { starts, frames, commits };
      new MutationObserver(records => {
        for (const record of records) {
          const el = record.target as HTMLElement;
          const sampled = Number(el.dataset.visualSample);
          const delivered = el.dataset.visualDelivered ? Number(el.dataset.visualDelivered) : undefined;
          if (sampled > 0) commits.push({
            pulse: el.dataset.visualPulse, commitMs: performance.now() - sampled,
            queueMs: delivered !== undefined ? sampled - delivered : undefined,
          });
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-visual-pulse"] });
      const original = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function () {
        const ctx = this;
        const source = original.call(ctx);
        const start = source.start.bind(source);
        source.start = (...args: any[]) => {
          starts.push({ when: Math.max(args[0] ?? 0, ctx.currentTime), now: ctx.currentTime, wall: performance.now(), loop: source.loop, length: source.buffer?.duration, ctx });
          return start(...args as [number]);
        };
        return source;
      };
      function capture() {
        const output = [...starts].reverse().find(s => s.loop) ?? [...starts].reverse().find(s => s.length > 0.005);
        if (output && document.querySelector('[data-testid="play-button"]')?.getAttribute("aria-pressed") === "true") {
          const ctx: AudioContext = output.ctx;
          const stamp = ctx.getOutputTimestamp?.();
          const presentation = stamp && (stamp.contextTime > 0 || stamp.performanceTime > 0)
            ? Math.min(ctx.currentTime, stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000)
            : ctx.currentTime - (ctx.baseLatency || 0) - (ctx.outputLatency || 0);
          const cells = [...document.querySelectorAll('[data-testid^="subdivision-cell-"]')];
          const active = cells.findIndex(cell => cell.firstElementChild && getComputedStyle(cell.firstElementChild).opacity === "1");
          const glow = document.querySelector('[data-testid="beat-center-glow"]');
          frames.push({ at: performance.now(), elapsed: (presentation - starts[0].when) * 1000,
            active, glow: glow ? Number(getComputedStyle(glow).opacity) : 0 });
        }
      }
      function sample() {
        // Sample the applied DOM after this frame's app rAF callbacks/React
        // commit, rather than reading the previous frame before its update.
        setTimeout(capture, 0);
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }, { bpm, slots, volume, tone });
    // Navigate once for the origin, then render the real app in an embedded frame.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      document.body.innerHTML = '<iframe id="app" src="/" allow="autoplay; microphone" style="width:100%;height:100vh;border:0"></iframe>';
    });
    const app = page.frameLocator("#app");
    await expect(app.getByTestId("play-button")).toBeVisible({ timeout: 60000 });
    await app.getByTestId("play-button").click();
    await expect(app.getByTestId("play-button")).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(3200);
    const frame = page.frames().find(f => f.parentFrame())!;
    const results = await frame.evaluate(({ bpm, slots }) => {
      const { starts, frames, commits } = (window as any).__visualProbe;
      const interval = 60000 / bpm / slots;
      const steady = frames.filter((f: any) => f.elapsed > 300 && f.elapsed < 3000);
      const mismatch = steady.filter((f: any) => f.active >= 0 &&
        f.active !== Math.floor(Math.max(0, f.elapsed) / interval) % slots);
      let peaks = 0;
      const transitionLags: number[] = [];
      for (let i = 1; i < steady.length - 1; i++) {
        if (steady[i].glow > 0.02 && steady[i].glow > steady[i - 1].glow && steady[i].glow >= steady[i + 1].glow) peaks++;
        if (slots > 1 && steady[i].active >= 0 && steady[i].active !== steady[i - 1].active) {
          const beatMs = interval * slots;
          let age = ((steady[i].elapsed - steady[i].active * interval) % beatMs + beatMs) % beatMs;
          if (age > beatMs / 2) age -= beatMs;
          transitionLags.push(age);
        }
      }
      transitionLags.sort((a, b) => a - b);
      const median = (items: number[]) => items.sort((a, b) => a - b)[Math.floor(items.length / 2)];
      return { bpm, slots, frames: steady.length, mismatches: mismatch.length, peaks,
        medianFrameQueueMs: median(commits.map((c: any) => c.queueMs).filter(Number.isFinite)),
        medianFrameCommitMs: median(commits.map((c: any) => c.commitMs)),
        medianPositionLagMs: transitionLags[Math.floor(transitionLags.length / 2)],
        p95PositionLagMs: transitionLags[Math.floor(transitionLags.length * 0.95)],
        expectedPulses: Math.floor(2700 / interval), rendered: starts.some((s: any) => s.loop),
        starts: starts.length, maxGlow: Math.max(...steady.map((f: any) => f.glow)) };
    }, { bpm, slots });
    console.log("VISUAL_PROBE", JSON.stringify(results));
    expect(results.frames).toBeGreaterThan(20);
    expect(results.peaks).toBeGreaterThan(results.expectedPulses * 0.3);
    if (slots > 1) {
      expect(results.medianPositionLagMs).toBeLessThan(Math.max(35, 60000 / bpm / slots));
      expect(results.p95PositionLagMs).toBeLessThan(120);
    }
    if (tone) expect(results.rendered).toBe(true);
    // Stall JS (audio retains its own clock), then verify recovery/restart.
    if (bpm === 240 && slots === 9) {
      await frame.evaluate(() => {
        const until = performance.now() + 130;
        while (performance.now() < until) { /* deliberate main-thread stall */ }
      });
      await page.waitForTimeout(500);
      await expect(app.getByTestId("play-button")).toHaveAttribute("aria-pressed", "true");
      const recovered = await frame.evaluate(() => {
        const frames = (window as any).__visualProbe.frames.slice(-12);
        return frames.filter((f: any) => f.active !== Math.floor(Math.max(0, f.elapsed) / (250 / 9)) % 9).length;
      });
      expect(recovered).toBeLessThanOrEqual(6);
    }
    await app.getByTestId("play-button").click();
    await expect(app.getByTestId("play-button")).toHaveAttribute("aria-pressed", "false");
    await page.waitForTimeout(250);
    const stoppedGlow = await app.getByTestId("beat-center-glow").evaluate(el => Number(getComputedStyle(el).opacity));
    expect(stoppedGlow).toBeLessThan(0.05);
    await app.getByTestId("play-button").click();
    await expect(app.getByTestId("play-button")).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(300);
    await app.getByTestId("play-button").click();
  });
}