---
name: Settings retry notifications
description: Keep automatic settings-save recovery visible without blocking people on every retry.
---

Automatic settings-save retries must suppress the global storage-error alert and
show their own nonblocking status instead.

**Why:** The global subscriber uses a native modal alert. Emitting it for each
backoff attempt blocks interaction and defeats a retry banner's purpose.

**How to apply:** Keep immediate, one-off storage failures on the global error
path unless they have an equivalent recovery UI. For a retrying settings flow,
surface retry and exhausted-cycle states through its nonblocking UI; the
exhausted state must not claim that a retry is currently running.