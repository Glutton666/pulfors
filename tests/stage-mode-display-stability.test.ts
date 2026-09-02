import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const beatColumnSrc = readFileSync("components/StageBeatColumn.tsx", "utf8");
const overlaySrc = readFileSync("components/StageModeOverlay.tsx", "utf8");

describe("stage beat display stability", () => {
  test("updates beats without a vertical transition", () => {
    assert.equal(beatColumnSrc.includes("react-native-reanimated"), false);
    assert.equal(beatColumnSrc.includes("translateY"), false);
    assert.equal(beatColumnSrc.includes("withTiming"), false);
  });

  test("keeps explanatory labels out of the visual beat cards", () => {
    const visualLabelPattern = /<Text[^>]*>\s*\{labels\.(current|next|beat|subdivision)\}\s*<\/Text>/s;
    assert.equal(visualLabelPattern.test(beatColumnSrc), false);
    assert.ok(beatColumnSrc.includes("accessibilityLabel={`${labels.current}"));
    assert.ok(beatColumnSrc.includes("accessibilityLabel={`${labels.next}"));
  });

  test("uses dot-only subdivision visuals", () => {
    assert.equal(beatColumnSrc.includes('const label = t === "strong"'), false);
    assert.equal(beatColumnSrc.includes("<Text\n                style={{"), false);
    assert.ok(beatColumnSrc.includes("const isStrong = t === \"strong\""));
    assert.ok(beatColumnSrc.includes("rootW - 32"));
  });

  test("scales the complete card stack from the measured container height", () => {
    assert.ok(beatColumnSrc.includes("rootH / 370"));
    assert.ok(beatColumnSrc.includes("detailHeight"));
    assert.ok(beatColumnSrc.includes("cardPadding"));
    assert.ok(beatColumnSrc.includes("stackGap"));
  });
});

describe("stage fullscreen fallbacks", () => {
  test("uses fullscreen score mode only when the score has renderable measures", () => {
    assert.ok(overlaySrc.includes("const hasScoreContent"));
    assert.ok(overlaySrc.includes("part.measures.length > 0"));
    assert.ok(overlaySrc.includes("const isFullscreen = hasScoreContent || hasPhoto"));
  });

  test("falls back from a photo after the native image reports a load error", () => {
    assert.ok(overlaySrc.includes("failedPhotoUri !== stageNoteImageUri"));
    assert.ok(overlaySrc.includes("onError={() => setFailedPhotoUri(stageNoteImageUri)}"));
  });

  test("opens stage panels and pickers without slide animations", () => {
    assert.equal(overlaySrc.includes('animationType="slide"'), false);
    assert.ok(overlaySrc.includes('animationType="none"'));
    assert.equal(overlaySrc.includes("settingsPanelStyle"), false);
  });

  test("scrolls score progress immediately instead of animating", () => {
    assert.ok(overlaySrc.includes("scrollTo({ y: scrollY, animated: false })"));
  });
});