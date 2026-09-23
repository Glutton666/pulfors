---
name: Background lease keepalive status grace window
description: Why the background-playback keepalive player ignores status flips for a short window right after (re)activation.
---

The keepalive player in `lib/background-playback-lease.ts` (a silent looping native player that backs the Android lock-screen/MediaSession controls) can report a spurious transient `playing` flip right around its own creation — the same class of native transport instability documented in `.agents/memory/android-focus-probe-stabilization.md` for the Android audio-focus probe.

**Why:** `handleKeepaliveStatus` maps a `playing` flip directly to `controls.pause()`/`controls.resume()`, which are wired to the real `togglePlayPause()`. A spurious flip right after `activate()` therefore stops/restarts real playback, which re-activates a new keepalive player, which can flip again — a self-sustaining loop. On a real device (2026-09-24) this exhausted the Java heap and crashed the app (`OutOfMemoryError` inside ExoPlayer's own `Loader.release()`) within ~7 seconds of launch, with thousands of `AudioPolicyManager`/`MediaSessionRecord` churn events per second in logcat.

Unlike the focus probe's noisy periodic polling, a genuine remote MediaSession command (headset button, lock-screen tap) is a single deliberate event and must stay instant — so this cannot be fixed with a multi-sample debounce like the focus probe uses. Instead, `handleKeepaliveStatus` ignores any status flip within `REMOTE_STATUS_GRACE_MS` (500ms) of `acceptsRemoteStatusAt` (set when the keepalive player finishes activating), and responds immediately to flips after that window.

**How to apply:** Any future code that reacts to a native player's own `playing`/status callback as if it were an authoritative external signal (remote command, OS interruption, etc.) needs to account for transient instability at creation/teardown time — either via a short post-activation grace window (this file) or multi-sample debouncing (`android-audio-focus.ts`), whichever preserves genuine-signal responsiveness for that specific callback's real use case. Test both "flip immediately after activation → ignored" and "flip well after activation → honored".
