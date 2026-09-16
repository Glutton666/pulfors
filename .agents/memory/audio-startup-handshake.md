---
name: Audio startup handshake
description: Rules for keeping playback UI, delayed native player work, and audio lifecycle in sync during startup and cancellation.
---

Do not publish playing state, notifications, timers, or practice-session activity until rendered playback is accepted or a realtime path reports attempt-scoped audio activity. Apply one deadline to the whole preparation sequence, not only the final play call.

Every start attempt must own an audio activity epoch. Every stop, pause, cancellation, mode exit, background transition, and interruption must invalidate that epoch before stopping output. Native pool callbacks must check the captured epoch after delayed seek work and before calling play; checking only when recording activity is too late.

Realtime engine visual callbacks can precede confirmed output. Keep only their latest pending beat/subbeat/progress state while preparing, then flush it immediately after playing state is accepted. Never discard the first pending visual merely because playing is still false; discard it only when preparation is no longer active or teardown explicitly resets visuals.

**Why:** Native seek and decoder work can finish after cancellation. A global timestamp or an epoch invalidated only on some paths lets a stale callback produce a late click or mark a newer recovery as successful. Dropping callbacks during preparation makes the audible first click lead the screen by one beat.

**How to apply:** Any new playback entry point should use the shared startup handshake. Any new teardown path must invalidate both the async start attempt and audio activity ownership, discard pending visuals, and preserve interrupted/recovering lifecycle when the OS owns the pause.

Queue-based playback must use the shared startup handshake after applying its schedule, with ordinary mode configuration disabled so the queue entry is not overwritten. Treat sample preload as part of the cancellable attempt: publish preparing ownership before awaiting it, and invalidate its own generation on every entry replacement, including replacements with no samples. Set the mode-specific playing ref before startup so synchronous beat 0 is counted, but let the handshake publish global playing state only after audio is accepted. At each queue boundary, stop the old rendered/realtime owner before preparing the next entry; pause, exit, removal, reset, and final exhaustion must use shared lifecycle/session teardown.