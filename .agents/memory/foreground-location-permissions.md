---
name: Foreground location permissions
description: Practice-room location must stay foreground-only; Expo permission defaults need explicit opt-outs.
---

Practice-room GPS uses foreground permission only. Do not introduce background location access for this feature.

**Why:** The user approved removing unnecessary Always-location declarations because they do not match the feature's purpose.

**How to apply:** Keep both Always-location permission options explicitly `false` in the Expo location plugin. Omitting them is insufficient: the installed plugin supplies default iOS Always descriptions. Check resolved native configuration rather than only the source JSON, and preserve background audio independently.
