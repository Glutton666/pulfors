---
name: Single-cell subdivision restore
description: Prevents legacy one-cell subdivision data from overriding the visible Beat-mode pattern.
---

A subdivision pattern is valid only when it contains more than one cell. Bulk restore paths must enforce the same rule as single-beat setters and discard arrays of length zero or one.

**Why:** Legacy persisted one-cell patterns can be invisible in the UI while still overriding the engine's beat type. A visible accent-normal-normal-normal-normal pattern can then play as four accents followed by one normal.

**How to apply:** Normalize subdivision maps at the engine ingestion boundary, including settings restore, mode transitions, and imported configurations. The visible beat type remains the source of truth for a one-cell beat.