---
name: Mode dial top-center anchoring
description: Why the mode switcher fan must bypass anchorPos/safeT when anchored to the top-center text label
---

The ModeSwitcherDial's `anchorPos` applies `safeT`, a camera-safe zone that shoves top-wall `t` values in (0.28, 0.72) out to 0.25/0.75. So requesting `{wall:"top", t:0.5}` silently renders at 75% width.

**Why:** safeT exists so the draggable D-tab avoids the notch/Dynamic Island; a text-label-anchored fan (hideHandle mode) must ignore it.

**How to apply:** In hideHandle mode, compute the anchor directly as `{x: winW/2, y: topInset}` and pin ALL geometry (`wall`, `effectiveArcParams`, `fanBgLayout`, etc.) to the top-center WallPos — overriding only the anchor while geometry still reads stored `wallPos` misplaces the fan.
