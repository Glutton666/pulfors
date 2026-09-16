---
name: Complete playback-stop boundary
description: Ordering and scope rules for terminal audio stops versus active output replacement.
---

Every terminal playback stop must first invalidate startup probes, sample preloads, queued sample-start timers/seek continuations, watchdogs, delayed re-renders, and render generations; only then stop the engine and release pending, rendered, realtime, Blob URL, and sample-playback ownership. Active output replacement may use narrower rendered-output cleanup.

**Why:** A delayed producer can finish after a stop and attach stale audio to a newly started session. Direct player release also bypasses idempotent ownership tracking and can double-release during unmount or preload cleanup.

**How to apply:** Route user pause, cancellation, timer/fade completion, mode exit, full reset, and screen unmount through the complete-stop boundary. Keep narrow cleanup only for intentional seamless queue handoff or rendered-to-realtime replacement.

Individual sample deletion must remain key-scoped: removing one player must not invalidate other samples' seek continuations or end timers.