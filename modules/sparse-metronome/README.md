# Android sparse playback prototype

This module is **not connected to the app or registered for Android autolinking**.
The native foreground service and clip preparation are incomplete as a playback
replacement: BPM/Bar schedule changes have not been made atomic between the
JavaScript engine and native audio, and an Android build or device test has not
been run. Do not add `expo-module.config.json` or route playback here until those
gaps are resolved and existing custom/sample-backed patterns are supported.