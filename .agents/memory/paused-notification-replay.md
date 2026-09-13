---
name: Paused notification replay
description: Keeping Android notification playback controls responsive without foregrounding the app after the metronome stops.
---

An Android notification action cannot reliably restart the metronome from a stopped state unless a process with the playback engine is still alive. While the paused control notification remains enabled, keep the MediaSessionService alive with a looping true-silence audio asset; release that player when playback resumes or the notification is dismissed.

**Why:** Stopping the last `AudioPlayer` stops Expo Audio's foreground service and lets Android suspend the JS process. A background-only notification action then has no mounted engine to call. Opening the app works but violates the requirement that controls stay inside the notification.

**How to apply:** The paused notification owns the silent keepalive. Do not use a normal click at volume zero because native volume assignment can race and leak a sound. Release the keepalive on every notification-disable, dismiss, failure, and playback-resume path.