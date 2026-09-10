---
name: Capped meter changes
description: Why capped add controls must not invoke the time-signature updater with an unchanged value.
---

When an add gesture or button reaches its maximum beat count, return without calling the time-signature updater. Do not clamp and submit the current count.

**Why:** An equal-count update is an intentional reset path that rebuilds default beat types. At higher existing counts, clamping to a lower cap can also truncate beats and subdivision data.

**How to apply:** Guard capped add controls before dispatch. Use a helper that returns no next value at the cap, and test both the exact cap and pre-existing counts above it.