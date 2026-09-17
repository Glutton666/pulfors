---
name: Shared PCM cancellation
description: Cancellation and invalidation rules for deduplicated audio preparation shared by multiple callers.
---

For deduplicated PCM preparation, a caller's abort must reject only that caller's wait. The underlying decode may be cancelled only when no active waiters remain. Key or global invalidation must abort the matching shared work and prevent late completion from publishing.

**Why:** Using the first caller's signal as the shared decoder signal lets one cancelled consumer break another active consumer. Letting ignored aborts publish afterward can restore stale PCM after settings changes or teardown.

**How to apply:** Give each shared request an internal controller, track waiter count, pass the internal signal through nested loaders, and gate publication on both key revision and global generation. Preserve cancellation as a distinct result through public preparation APIs.