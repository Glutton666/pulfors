---
name: Bar mode duration editing
description: The bar editor treats minutes and seconds as independently selected duration fields.
---

The bar-mode duration control must keep the selected unit independent: changing minutes preserves seconds, changing seconds preserves minutes, and attempting to move beyond a unit boundary leaves the other unit unchanged.

**Why:** The duration is presented as a single `mm:ss` value, but users explicitly choose which side is active before using the shared +/- control. Carrying or borrowing across the colon makes the control change a unit the user did not select.

**How to apply:** Keep the selected-part state in the duration control and clamp minutes to 00–59 and seconds to 00–59. Enforce the non-zero duration minimum without rolling the opposite field.