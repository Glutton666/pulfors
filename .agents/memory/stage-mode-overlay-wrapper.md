---
name: Stage mode overlay wrapper
description: Why StageModeOverlay's Animated.View wrapper needs absoluteFillObject
---

## Rule
The `Animated.View` that wraps `StageModeOverlay` in `MetronomeScreenUI.tsx`
**must** include `StyleSheet.absoluteFillObject` in its style array, exactly
like the other mode-transition overlays (score list, score editor, menu).

Without it the wrapper collapses to 0×0 (because its only child,
StageModeOverlay, uses `position: absolute` and thus doesn't contribute to
the parent's size). StageModeOverlay's own `absoluteFillObject` then fills
that 0×0 box instead of the viewport — stage mode renders off-screen and
appears to "crash."

**Why:** Mode-transition overlays in this app follow the pattern
`[StyleSheet.absoluteFillObject, { zIndex: N }, modeSlideStyle]`.
StageModeOverlay's wrapper was added later and the absoluteFillObject was
accidentally omitted.

**How to apply:**
- Any time a full-screen overlay uses `modeSlideStyle` as its Animated.View
  style, always combine it with `StyleSheet.absoluteFillObject`.
- Also add `pointerEvents="box-none"` so the transparent full-screen wrapper
  doesn't block touch events when stage mode is inactive (StageModeOverlay
  returns null, leaving no children to receive events).
- Keep wrapper zIndex below ModeSwitcherDial (Z_OVERLAY=100000); 99999 works.
