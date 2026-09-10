---
name: Notification preference races
description: Preventing in-flight notification work from publishing after the user disables it.
---

Capture a monotonic preference revision when starting notification work, then re-check both the enabled state and revision immediately before every native publish.

**Why:** Permission, category, and native notification calls are asynchronous. An initial enabled check is insufficient because the user can disable notifications while an older operation is awaiting, allowing the stale operation to republish after dismissal.

**How to apply:** Any user-disableable asynchronous alert or notification path must invalidate work already in flight and test the disable-during-await case.