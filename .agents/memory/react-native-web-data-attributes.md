---
name: React Native Web custom data attributes
description: DOM-only ownership markers need View.dataSet rather than arbitrary data-* props.
---

Use React Native Web's `View.dataSet` for custom DOM data attributes. Arbitrary `data-*` properties passed through a View's props can be silently discarded even when TypeScript accepts them via a cast.

**Why:** A keyboard-capture marker passed as a raw DOM prop never reached the slider element, so both the focused BPM control and the global shortcut handler processed one arrow key. The documented View dataSet mapping made the marker visible to the global handler.

**How to apply:** For keyboard ownership, use `dataSet={{ capturesKeys: "true" }}` so the DOM contains `data-captures-keys="true"`. Verify actual browser attributes/behavior rather than assuming a type cast forwards arbitrary properties. This does not replace the separate rules for RNW aria attributes.
