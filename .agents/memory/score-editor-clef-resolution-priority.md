---
name: Score editor clef resolution priority
description: Correct precedence order for resolving the "effective" clef in the score editor UI (selected measure > draft measure > part default).
---

The score editor's measure-settings drawer lets the clef-cycle button change either:
- the selected measure's `clef` (when a measure is selected), or
- the "draft measure" clef (the template used for the next measure to be added, when nothing is selected).

Neither of these writes to the part-level default `part.clef`. Any UI logic that needs to know "is the
current editing context percussion/treble/bass/etc." must resolve clef with this exact priority:

```
effectiveClef = (selectedMeasureIdx !== null
  ? part.measures[selectedMeasureIdx]?.clef
  : draftMeasure.clef) ?? part.clef ?? "treble"
```

**Why:** A percussion-notation feature checked only `part.clef === "percussion"` to decide whether to show
drum-specific UI (drum type picker, drum notehead glyphs). Since changing clef via the drawer only ever
touches the measure/draft clef, `part.clef` never became `"percussion"`, so the drum UI silently never
appeared even though the drawer displayed "percussion" as the current clef. This passed `tsc --noEmit`
and unit tests cleanly — it was only caught by an end-to-end test that actually cycled the clef through
the UI and checked for the drum palette buttons.

**How to apply:** Whenever adding new UI that branches on "what clef is currently active" in
`components/ScoreEditorScreen.tsx`, always use the same effective-clef resolution as the drawer's own
display text does — never take a shortcut through `part.clef` alone. If a similar per-measure-override
pattern appears elsewhere (e.g. key signature, time signature, BPM), assume the same trap applies and
verify with an e2e click-through, since type-checking cannot catch this class of bug.
