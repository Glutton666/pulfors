---
name: Paused notification replay
description: Keeping Android notification playback controls responsive without foregrounding the app after the metronome stops.
---

An Android notification action cannot reliably restart the metronome from a stopped state unless the playback engine remains alive. While paused controls remain enabled, hold the plain non-MediaSession foreground service and the true-silence helper; release that hold when playback resumes or the notification is dismissed.

**Why:** Without an independent background hold, Android can suspend the JS process and a background-only notification action has no mounted engine to call. Opening the app violates the notification-only control requirement. Restoring Expo Audio's MediaSession would recreate the unwanted system media card.

**How to apply:** The paused notification owns the silent keepalive. Do not use a normal click at volume zero because native volume assignment can race and leak a sound. Release the keepalive on every notification-disable, dismiss, failure, and playback-resume path.