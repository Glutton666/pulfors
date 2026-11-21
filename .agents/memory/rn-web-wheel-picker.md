---
name: RN Web wheel picker completion
description: Mouse-wheel scrolling does not reliably emit React Native drag or momentum end callbacks.
---

React Native Web FlatList can change its actual scrollTop under a mouse wheel without firing onScrollEndDrag or onMomentumScrollEnd.

**Why:** Browser verification showed the octave wheel visibly scrolling while the selected octave and target frequency remained unchanged.

**How to apply:** Commit web wheel selection from a debounced onScroll offset, cancel that debounce on controlled selection changes and unmount, and retain native drag/momentum completion handling.

When switching to another tuner mode, keep the general tuner's controlled wheels mounted but hidden from pointer, keyboard, and accessibility navigation. Remounting can report the default scroll position before restoring the saved octave and overwrite an unrelated target.

**Why:** On Chrome, entering and leaving drum lug measurement remounted the wheel and changed the general target to the first octave.

**How to apply:** Verify a manually entered, non-note target survives the mode round-trip. Do not use the wheel's initial DOM scroll event as evidence of a user choice.
