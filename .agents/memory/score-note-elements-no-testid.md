---
name: Score renderer note/rest elements have no DOM testID
description: react-native-svg note/rest glyphs in the score editor can't be targeted by Playwright via testID selectors.
---

Note and rest glyphs in the score editor are drawn via `react-native-svg` primitives (Circle/Path/Text inside `<Svg>`) in `ScoreRenderer`. These do not expose `testID` as `data-testid` on web the way regular RN `View`/`Pressable` do, so e2e locators like `[data-testid^="score-element-"]` find 0 matches even when notes are clearly visible on screen.

**Why:** SVG children aren't part of the RN Web accessibility/testID bridge the same way host components are; only the outer `<Svg>`/container gets a testable node.

**How to apply:** When testing score-editor selection/multi-select/tie/slur flows via `runTest()`, don't rely on note-element testIDs — verify via code review + `tsc --noEmit` + targeted unit tests instead, similar to the existing gesture-flow e2e limitation. Tap-based canvas interactions (hit-testing by coordinates) may still work in a real browser/device but are unreliable to script deterministically in Playwright.
