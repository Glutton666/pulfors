---
name: Bar reset UI-engine sync
description: Keeping the bar editor's displayed subdivision pattern synchronized with reset audio state.
---

Any bar-mode reset or blank bar-mode initialization that clears engine subdivisions must also reset the editor's staging subdivision pattern.

**Why:** The bar reset used to clear the engine and per-beat subdivision map while leaving the staging pattern untouched. The stopped editor then displayed an old pattern even though playback had correctly reverted to the default beat clicks.

**How to apply:** Treat the staging pattern, persisted per-beat map, and engine map as one reset group for user-visible reset actions. Add regression coverage whenever a new bar-reset entry point is introduced.