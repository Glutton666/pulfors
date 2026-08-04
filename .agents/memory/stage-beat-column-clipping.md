---
name: Stage beat column height clipping
description: Why stage-mode subdivision/measure dots were invisible on phone heights
---

Rule: content inside the stage-mode beat column must scale to the measured container height; never assume fixed large font sizes fit.

**Why:** the column root has `overflow: hidden` and centers a ~420px-tall stack (dots + divider + 172px/108px numbers + subdiv dots). On phone-height screens the container is ~283px, so the top (measure dots) and bottom (subdivision dots) were silently clipped — features looked "not implemented" though they rendered. Element boundingBox in Playwright still reports clipped elements, so screenshots, not DOM presence, reveal this class of bug.

**How to apply:** StageBeatColumn measures root height via onLayout and scales fonts/dot sizes by `min(1, h/430)`. Any new content added to the column must participate in this scaling. Also: subtle dots on the black stage background need ≥0.4 alpha to be visible.
