---
name: ScoreDocument fields serialize generically
description: New top-level ScoreDocument fields (e.g. layoutOverrides) flow through save/load/backup/share/deep-link automatically without touching those files.
---

`lib/score-io.ts`, `lib/deep-link-import.ts`, and `lib/backup/*` serialize/deserialize `ScoreDocument` as a whole rather than referencing individual fields like `ScoreNote`/`ScoreRest` by name. Adding a new top-level field to `ScoreDocument` (e.g. a layout-override map) does not require touching those files — they pass the document through generically.

**Why:** Confirmed via grep while separating freely-placed note X coordinates out of `ScoreNote`/`ScoreRest` into a dedicated `ScoreDocument.layoutOverrides` map — none of the save/load/backup/deep-link modules referenced the moved field directly.

**How to apply:** When adding/moving data on `ScoreDocument`, verify with grep whether it's referenced by name in `lib/score-io.ts`, `lib/deep-link-import.ts`, or `lib/backup/*` before assuming those flows need updates. If truly untouched, you can skip modifying them — but still add regression tests for any new field to guard against a future serializer becoming field-specific (e.g. schema validation should be checked for allow-listing/deny-listing of fields).
