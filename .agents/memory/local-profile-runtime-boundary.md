---
name: Local profile runtime boundary
description: Why profile changes close and reload a runtime instead of rebinding live storage.
---

Keep a running JS session bound to one local profile. Profile switches and active
identity edits intentionally reload the runtime after stopping producers and
flushing saves; do not replace this with a global mutable current-profile key.

**Why:** The app has many suspended native/file operations, retry queues and
module-level audio/document caches. Rebinding a shared adapter would make late
callbacks silently write into the destination profile. Other browser tabs must
also retain their own ownership until they explicitly switch.

**How to apply:** Preserve the immutable owner and closed-session write rejection.
Use the profile registry lock only for registry mutations, and keep imports in a
fresh unpublished namespace until their writes are verified. Retained migration
originals are recovery data, not a live fallback. An intentional all-profile reset
must remove those originals or they can be remigrated on a subsequent startup.
