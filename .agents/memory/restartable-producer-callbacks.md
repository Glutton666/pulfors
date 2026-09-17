---
name: Restartable producer callbacks
description: Why callbacks captured before stop or disable need generation identity, not only live boolean gates.
---

Callbacks installed into engines or other external producers must capture an immutable lifecycle generation and compare it with the current generation before advancing phase or emitting output.

**Why:** A live `enabled` or `playing` boolean suppresses an old callback only while stopped. After restart or re-enable, the boolean becomes true again, so both stale and current callbacks can run and corrupt phase or duplicate output.

**How to apply:** Rotate the producer generation whenever registration lifetime changes, including cleanup, stop/restart, and disable/re-enable. Test by retaining the old callback, restarting, then invoking both old and current callbacks.