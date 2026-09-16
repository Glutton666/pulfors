---
name: Mode keyboard override persistence
description: How per-mode keyboard settings should inherit later global binding changes.
---

Persist only bindings that differ from the current global bindings in each mode's override record. Never save a complete resolved binding map as a mode override.

**Why:** A resolved map contains inherited global values. Saving the whole map turns those inherited values into accidental overrides, so later global rebinding changes stop reaching that mode.

**How to apply:** When saving beat, bar, note, or stage keyboard settings, filter to that mode's actions and persist only values that differ from the global binding map. Loading should merge global bindings first, then the sparse mode overrides.