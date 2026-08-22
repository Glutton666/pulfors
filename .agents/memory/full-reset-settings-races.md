---
name: Full reset settings races
description: Preventing an application reset from being undone by stale asynchronous settings work.
---

Before a full settings reset clears storage, invalidate the initial asynchronous settings load, cancel pending debounced settings writes, and serialize the clear after any already-started settings write.

**Why:** A load begun before reset can finish after the engine has been cleared and restore an old subdivision pattern to React state only. Separately, an already-started storage write can finish after a plain clear and recreate the old persisted pattern.

**How to apply:** Any future full-reset entry point must use the settings hook's reset-safe invalidation and persistence-cancellation controls before deleting stored data, and must use the reset-aware storage clear rather than calling `AsyncStorage.clear()` directly. Treat new asynchronous settings hydration paths as cancelable for the same reason.