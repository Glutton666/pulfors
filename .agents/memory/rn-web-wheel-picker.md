---
name: RN Web wheel picker completion
description: Mouse-wheel scrolling does not reliably emit React Native drag or momentum end callbacks.
---

React Native Web FlatList can change its actual scrollTop under a mouse wheel without firing onScrollEndDrag or onMomentumScrollEnd.

**Why:** Browser verification showed the octave wheel visibly scrolling while the selected octave and target frequency remained unchanged.

**How to apply:** Commit web wheel selection from a debounced onScroll offset, cancel that debounce on controlled selection changes and unmount, and retain native drag/momentum completion handling.
