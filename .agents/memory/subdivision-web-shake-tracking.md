---
name: Subdivision web shake tracking
description: Reliable shake-to-reset detection for the subdivision bar across React Native and React Native Web.
---

When a gesture tracker receives cumulative `dx` values (distance from the touch-down
point), start it with position `0` before the first move. Otherwise the first
meaningful left/right segment only establishes a position and is not counted as a
direction, so a gesture requiring four reversals silently requires five.

**Why:** The web subdivision reset received all browser pointer events but missed
the final expected reversal because its tracker began at `null`.

**How to apply:** Seed cumulative-displacement trackers at gesture start, then
compare consecutive values for reversals. On React Native Web, capture the
document-level `pointerdown` event and filter it to the gesture wrapper; attaching
the start listener through a `View` ref was not reliable in the Expo web build.