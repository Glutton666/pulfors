---
name: Local profile runtime boundary
description: Why profile changes close and reload a runtime instead of rebinding live storage.
---

Keep a running JS session bound to one local profile. Profile switches reload
the runtime after stopping producers and flushing saves; do not replace this
with a global mutable current-profile key.

**Why:** The app has many suspended native/file operations, retry queues and
module-level audio/document caches. Rebinding a shared adapter would make late
callbacks silently write into the destination profile. Other browser tabs must
also retain their own ownership until they explicitly switch.

**How to apply:** Preserve the immutable owner and closed-session write rejection.
Registry mutations and a write's membership check must serialize so a surviving
browser tab cannot recreate a deleted namespace. Keep imports unpublished until
their writes are verified. An all-profile reset must also remove retained originals
or they can be remigrated on startup.

Identity-only edits do not change ownership and must not stop playback or reload.
Serialize them with normal settings writes, protect newer identity revisions from
stale snapshots, and notify the live UI, including queued identity deltas.

**Why:** Reloading merely to rename a profile interrupted practice unnecessarily.
Keeping the immutable owner does not require treating a name/photo edit as a handoff.

Recovery must never silently bind an incomplete migration or start empty. A user
may explicitly choose the original, unnamespaced data as that profile's fixed
backing when quota prevents copying. This is not a read-through fallback for
missing keys in an ordinary namespaced profile.

**Why:** Retaining originals protects recovery but copying them can exhaust browser
storage before migration commits. Explicit in-place access preserves those originals
without the second copy. Only byte-identical retained originals may be cleaned up
after confirmation; changed originals remain recovery material.
