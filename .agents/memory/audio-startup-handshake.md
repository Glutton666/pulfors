---
name: Audio startup handshake
description: Rules for keeping playback UI, delayed native player work, and audio lifecycle in sync during startup and cancellation.
---

Do not publish playing state, notifications, timers, or practice-session activity until rendered playback is accepted or a realtime path reports attempt-scoped audio activity. Apply one deadline to the whole preparation sequence, not only the final play call.

Every start attempt must own an audio activity epoch. Every stop, pause, cancellation, mode exit, background transition, and interruption must invalidate that epoch before stopping output. Native pool callbacks must check the captured epoch after delayed seek work and before calling play; checking only when recording activity is too late.

**Why:** Native seek and decoder work can finish after cancellation. A global timestamp or an epoch invalidated only on some paths lets a stale callback produce a late click or mark a newer recovery as successful.

**How to apply:** Any new playback entry point should use the shared startup handshake. Any new teardown path must invalidate both the async start attempt and audio activity ownership while preserving interrupted/recovering lifecycle when the OS owns the pause.