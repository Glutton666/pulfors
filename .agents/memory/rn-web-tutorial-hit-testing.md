---
name: RN Web tutorial hit testing
description: Pointer-event rules for non-blocking tutorial overlays and interactive BPM controls on React Native Web.
---

React Native Web can turn `box-none` into a wrapper that still participates in browser hit testing, and an instructional card can physically overlap the control it describes on short screens. Tutorial wrappers/cards should therefore be transparent to hit testing on web, with only explicit actions such as Skip opting back in. Decorative absolute layers inside interactive controls must also use `pointerEvents="none"`.

**Why:** The mode tutorial rendered correctly but intercepted the BPM control, so the first quest could not be completed in the browser.

**How to apply:** When adding an RN tutorial, coachmark, or overlay, verify both DOM `elementFromPoint` behavior and the actual interaction underneath at compact viewport heights.