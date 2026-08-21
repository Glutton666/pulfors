---
name: Note-sample persistence retries
description: Retry and waiter-settlement rules for serialized note-sample storage writes.
---

When a debounced last-write-wins note-sample save retries, keep the failed cycle's waiters through retry attempts, but version every newer save. Resolve only waiters whose value was included in the successful merged write; later values remain queued for their own write.

**Why:** A retry can absorb a later pending value. A single resolver queue either resolves that later caller before its value is durable or leaves it hanging after the retry succeeds.

**How to apply:** Exhausted cycles report failure through the persister hook and reject only their own waiters; a later user save starts a fresh cycle. Keep public save helpers' existing non-throwing behavior separate from internal status/reporting.

Status consumers must subscribe to persister transitions instead of only polling when retry backoff is shorter than the UI polling interval.

**Why:** A transient failure can recover between polls, hiding a truthful “retrying” warning from the user.

**How to apply:** Use the persister status subscription for user-visible save health and unsubscribe when the observing screen unmounts; observers must never be allowed to interrupt persistence.