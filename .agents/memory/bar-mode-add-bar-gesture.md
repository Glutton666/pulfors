---
name: Bar Mode "Add Bar" is a swipe gesture, not a button
description: Why clicking the "↑ Add Bar" text in Bar Mode does nothing, and how to trigger it in e2e/Playwright tests.
---

In `components/BarModeView.tsx`, the "↑Add Bar" text near the bottom editor panel is only a hint label. Adding the first/next bar requires a swipe-up gesture (PanResponder `editorSwipePan`, threshold `dy < -50px`) on the bottom editor panel area — there is no clickable "Add Bar" button. `handleAddBar` also no-ops if the metronome `isPlaying`.

**Why:** Repeated Playwright `click()` attempts on the "Add Bar" text silently do nothing (no error, no state change), which looks like a bug but is actually a gesture-vs-button mismatch. Wasted several e2e iterations before finding the real trigger.

**How to apply:** In e2e test plans that need at least one bar to exist in Bar Mode (e.g. to reach a bar row for long-press), simulate a drag: `mouse.move` to the editor panel, `mouse.down()`, several incremental `mouse.move()` steps upward totaling ~70-100px, then `mouse.up()`. A single instant jump may not register with React Native's PanResponder — use multiple intermediate move steps. Also ensure the metronome is stopped first.
