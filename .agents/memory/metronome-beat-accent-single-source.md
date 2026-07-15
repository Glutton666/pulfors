---
name: Metronome beat accent single source of truth
description: Where meter/accent-grouping logic belongs in the metronome codebase, and why the engine doesn't need changes for grouping fixes.
---

`app/index.helpers.ts`'s `defaultBeatTypes(beats)` is the single source of truth for which beats are "strong" / "accent" / "normal" in a measure. Both the audio engine (`lib/metronome-engine.ts`) and the visual dial (`components/DialBeatDot.tsx`, `components/BeatIndicator.tsx`) already branch on these three `BeatType` values:

- Engine: `strong` → distinct "strong" click sound, `accent` → "high" click, `normal` → "low" click (see `playTickAudio` / `fireTick` in `lib/metronome-engine.ts`).
- Dial: `strong` gets a border ring + strongest color, `accent` gets a muted accent color, `normal` gets the base color (`DialBeatDot.tsx`).

**Why:** this means any "beat N should sound/look different from beat M" requirement (e.g. compound-meter grouping like 6/8, 9/8, 12/8 accenting every 3rd eighth note) can be solved entirely by computing the right `BeatType[]` array — no engine or renderer changes needed.

**How to apply:** when adding new accent/grouping behavior, change what array `defaultBeatTypes` (or a call site that mutates `beatTypes` state) produces, rather than touching engine scheduling or dial rendering. Also check `app/index.tsx`'s `updateTimeSignature` — when beat count *increases*, it preserves old types and pads with "normal" rather than recomputing; if the new count needs a different default grouping (e.g. lands on 6/9/12), that branch must call the grouping-aware default instead of padding.
