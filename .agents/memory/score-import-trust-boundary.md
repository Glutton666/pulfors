---
name: Score import trust boundary
description: Semantic invariants and compatibility rules for accepting external score documents.
---

Imported scores must satisfy the invariants assumed by the editor, layout, and playback code—not merely match the TypeScript field shapes. IDs used as object-map keys need prototype-safe handling; cross-reference groups need uniqueness, ordering, membership, and ratio checks; aligned parts and globally addressed IDs must remain consistent.

**Why:** Structurally typed JSON can still pass malformed values that silently edit the wrong element, corrupt fixed-width notation, or create effectively non-terminating playback. Import-only limits can also reject files produced by the current editor.

**How to apply:** Validate before migration or persistence, use own-property checks for allowlists/maps, and share bounded-value validators with every editor path that produces the same field. Add both rejection tests and a current/legacy compatibility case for each boundary.