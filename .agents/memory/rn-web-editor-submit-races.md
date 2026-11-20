---
name: RN Web editor submit races
description: Keyboard submission and autofocus hazards for numeric editors inside scrolling modals.
---

Use the keyboard submit event's native text when committing a numeric value. Do not depend only on the latest React state having committed before Enter arrives.

**Why:** Back-to-back browser input and Enter submitted the old frequency even though the DOM contained the new text; a delay hid the race.

**How to apply:** Read `nativeEvent.text` for keyboard submission, retain the controlled draft for explicit Apply, and test immediate typing/submission without added waits.

An editor mounted with autofocus inside a ScrollView should not disappear merely because it blurs.

**Why:** In the web tuner, incidental focus/scroll handling blurred the newly mounted editor before the user could type. Blur-to-submit immediately removed it.

**How to apply:** Keep the draft open across incidental blur and finish through explicit Apply, keyboard submit, or cancellation.

Zoom fields with a confirmation must not apply again on React Native Web's deferred blur after Enter.

**Why:** The visible draft can revert to the last accepted value until confirmation; a second commit of that draft can undo the accepted zoom.

**How to apply:** Distinguish blur following submission from clicking away after editing, and verify zoom entry both with and without the confirmation.
