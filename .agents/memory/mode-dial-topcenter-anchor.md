---
name: Mode dial top-center anchoring
description: Why the mode switcher fan must bypass anchorPos/safeT when anchored to the top-center text label
---

The ModeSwitcherDial's `anchorPos` applies `safeT`, a camera-safe zone that shoves top-wall `t` values in (0.28, 0.72) out to 0.25/0.75. So requesting `{wall:"top", t:0.5}` silently renders at 75% width.

**Why:** safeT exists so the draggable D-tab avoids the notch/Dynamic Island; a text-label-anchored fan (hideHandle mode) must ignore it.

**How to apply:** In hideHandle mode, bypass the draggable tab's safeT calculation and pin ALL geometry (`wall`, `effectiveArcParams`, `fanBgLayout`, etc.) to the top-center WallPos. The fixed fan currently starts at the physical top edge; keep its anchor separate from the closed trigger's safe-area positioning. Overriding only the anchor while geometry still reads stored wallPos misplaces the fan.

## Closed header placement

Keep the mode trigger in the upper-center header band and the main metronome settings action at screen upper-left, separate from the beat controls.

**Why:** The user said the lowered mode dial intruded into the controls and explicitly requested settings at upper-left. The web body's reserved top padding is not a physical browser safe-area inset; reusing it for the header lowered the trigger into the practice area.

**How to apply:** Respect real native safe-area insets for header controls without inheriting the web body reserve. Keep Note's mode-switch trigger available even when excluding Note from the shared Beat/Bar settings action.
