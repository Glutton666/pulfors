---
name: Stage beat column height clipping
description: Why stage-mode subdivision/measure dots were invisible on phone heights
---

Rule: content inside the stage-mode beat column must scale all vertical dimensions to the measured container height, and beat changes must not translate the stack inside a clipped viewport.

**Why:** the column root clips overflow. Scaling only the beat numbers leaves rows, card padding, and gaps too tall, while a beat-change translation temporarily pushes the whole stack beyond the viewport. Both cases silently crop the top and bottom on phone-height screens.

**How to apply:** Measure the root height and scale fonts, detail rows, card padding, and gaps together. Keep beat updates immediate rather than translating the stack. Use screenshots, not DOM presence alone, to catch clipping.
