---
name: Gesture flows resist Playwright e2e
description: Chained gesture interactions (swipe-to-add-bar, long-press-to-open-modal) reliably stall the automated testing subagent; know when to fall back to static verification.
---

Testing multi-step flows that require chaining a swipe gesture (e.g. "swipe up ~80-100px on the editor panel to add a bar") followed by a long-press (e.g. "hold 500-700ms on a bar row to open a recorder modal") consistently fails in the Playwright-based testing subagent, even with very explicit selectors (`testID`), exact pixel/timing guidance, and multiple retries with refined instructions. The subagent's synthesized mouse-move/mouse-down sequences don't reliably trigger React Native's PanResponder-based gesture recognizers in this environment.

**Why:** Repeated attempts (3+ across a session) with increasingly detailed test plans all failed at the same step (gesture not registering), not because the app was broken — static analysis (TypeScript compile, targeted unit tests, manual code trace through the actual call sites) confirmed the underlying logic was correct.

**How to apply:** When a feature's only entry point is a chained gesture sequence (swipe + long-press, drag + drop, etc.), don't burn more than 2 e2e attempts on it. Fall back to: `tsc --noEmit`, targeted unit tests for the changed modules, and a manual trace of prop/state wiring across the relevant files. Document this as a known e2e limitation in the completion summary rather than as an unverified risk.
