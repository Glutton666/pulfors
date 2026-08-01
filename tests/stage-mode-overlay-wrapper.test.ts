/**
 * stage-mode-overlay-wrapper.test.ts
 *
 * Regression guard for the StageModeOverlay wrapper style bug (Task #495):
 *   The Animated.View that hosts StageModeOverlay must include
 *   StyleSheet.absoluteFillObject so the overlay fills the screen instead of
 *   collapsing to 0×0 off-screen.
 *
 * Approach: static source analysis — no React render environment needed.
 *
 * What it catches:
 *   - absoluteFillObject removed from the wrapper (original bug)
 *   - pointerEvents="box-none" removed (blocks touches on underlying UI)
 *   - testID="stage-mode-overlay" removed from StageModeOverlay root (makes
 *     future automated and manual inspection impossible)
 *
 * Related files:
 *   components/MetronomeScreenUI.tsx — wrapper Animated.View (lines 1232–1365)
 *   components/StageModeOverlay.tsx  — root View with testID (line 861)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const uiSrc = readFileSync("components/MetronomeScreenUI.tsx", "utf8");
const overlaySrc = readFileSync("components/StageModeOverlay.tsx", "utf8");

// ─── 1. Wrapper style: absoluteFillObject ────────────────────────────────────

describe("StageModeOverlay wrapper — StyleSheet.absoluteFillObject present", () => {
  /**
   * Extract the Animated.View block that immediately wraps StageModeOverlay.
   * We look for the closing </Animated.View> that follows <StageModeOverlay.
   * This is enough to isolate the relevant block without a full AST parse.
   */
  function extractWrapperBlock(): string {
    const openMarker = "<StageModeOverlay";
    const closeMarker = "</Animated.View>";

    const overlayIdx = uiSrc.indexOf(openMarker);
    assert.ok(overlayIdx !== -1, `Could not find ${openMarker} in MetronomeScreenUI.tsx`);

    // Find the Animated.View opening tag that starts before <StageModeOverlay
    // by scanning backward for the nearest "<Animated.View"
    const priorSrc = uiSrc.slice(0, overlayIdx);
    const animatedViewIdx = priorSrc.lastIndexOf("<Animated.View");
    assert.ok(
      animatedViewIdx !== -1,
      "Could not find <Animated.View before <StageModeOverlay in MetronomeScreenUI.tsx",
    );

    // Find the closing tag after <StageModeOverlay
    const closeIdx = uiSrc.indexOf(closeMarker, overlayIdx);
    assert.ok(
      closeIdx !== -1,
      `Could not find ${closeMarker} after <StageModeOverlay in MetronomeScreenUI.tsx`,
    );

    return uiSrc.slice(animatedViewIdx, closeIdx + closeMarker.length);
  }

  test("Animated.View wrapper includes StyleSheet.absoluteFillObject", () => {
    const block = extractWrapperBlock();
    assert.ok(
      block.includes("StyleSheet.absoluteFillObject"),
      [
        "The Animated.View wrapping StageModeOverlay must include StyleSheet.absoluteFillObject.",
        "Without it the overlay collapses to 0×0 and renders off-screen.",
        "Add StyleSheet.absoluteFillObject back to the style array of the wrapper.",
      ].join(" "),
    );
  });

  test("Animated.View wrapper uses zIndex to stay above all other content", () => {
    const block = extractWrapperBlock();
    assert.ok(
      block.includes("zIndex"),
      [
        "The Animated.View wrapping StageModeOverlay must declare a zIndex.",
        "Without it, other content may render on top of the overlay.",
      ].join(" "),
    );
  });

  test("Animated.View wrapper has pointerEvents='box-none' so the transparent area is touch-through", () => {
    const block = extractWrapperBlock();
    assert.ok(
      block.includes('pointerEvents="box-none"'),
      [
        "The Animated.View wrapping StageModeOverlay must set pointerEvents='box-none'.",
        "Without it, the transparent portion of the wrapper will swallow touches",
        "meant for the underlying metronome controls.",
      ].join(" "),
    );
  });

  test("StageModeOverlay is wired with visible={stageModeActive}", () => {
    const block = extractWrapperBlock();
    assert.ok(
      block.includes("visible={stageModeActive}"),
      [
        "StageModeOverlay must receive visible={stageModeActive}.",
        "If this prop is missing the overlay never becomes visible.",
      ].join(" "),
    );
  });
});

// ─── 2. StageModeOverlay root View: testID present ───────────────────────────

describe("StageModeOverlay root — testID='stage-mode-overlay' present", () => {
  test("StageModeOverlay.tsx contains testID='stage-mode-overlay' on its root View", () => {
    assert.ok(
      overlaySrc.includes('testID="stage-mode-overlay"'),
      [
        "StageModeOverlay root View must have testID='stage-mode-overlay'.",
        "This testID is required for automated inspection and future integration tests.",
      ].join(" "),
    );
  });
});

// ─── 3. MetronomeScreenUI: StyleSheet imported ───────────────────────────────

describe("MetronomeScreenUI — StyleSheet import", () => {
  test("MetronomeScreenUI.tsx imports StyleSheet from react-native", () => {
    assert.ok(
      uiSrc.includes("StyleSheet"),
      "StyleSheet must be imported in MetronomeScreenUI.tsx for absoluteFillObject to be available.",
    );
  });
});
