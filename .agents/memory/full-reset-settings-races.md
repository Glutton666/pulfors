---
name: Full reset settings races
description: Preventing an application reset from being undone by stale asynchronous settings work.
---

Before a full settings reset clears storage, invalidate the initial asynchronous settings load and cancel pending debounced settings writes.

**Why:** A load begun before reset can finish after the engine has been cleared and restore an old subdivision pattern to React state only. The UI then shows the old pattern while playback correctly uses the reset engine state.

**How to apply:** Any future full-reset entry point must use the settings hook's reset-safe invalidation and persistence-cancellation controls before deleting stored data. Treat new asynchronous settings hydration paths as cancelable for the same reason.