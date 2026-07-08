---
name: Expo Go connection hang/fail from orphaned EAS projectId
description: app.json extra.eas.projectId / updates.url with no expo-updates usage makes Expo Go demand manifest code-signing, hanging or failing dev connections.
---

If `app.json` has `extra.eas.projectId` (and/or `updates.url`) set but the project doesn't actually use `expo-updates` or EAS builds, Expo Go still detects the projectId and sends an `expo-expect-signature` header when requesting the dev manifest from Metro.

This forces the Expo CLI to fetch a development code-signing certificate, which requires an authenticated actor lookup. In a non-TTY-detected-as-interactive workflow (Replit workflows allocate a pty, so `process.stdout.isTTY` is true), this manifests as:
1. Metro hangs at an interactive "log in to Expo / Proceed anonymously" prompt nobody can answer → Expo Go shows a blue "connection/loading" error forever.
2. If you instead set `EXPO_OFFLINE=1` to dodge the prompt, cert fetch fails with "Offline and no cached development certificate found, unable to sign manifest" → manifest is served unsigned, which can still fail on the Expo Go client side.

**Why:** Expo Go's signature requirement is opt-in per project (triggered by presence of an EAS projectId), not something that can be cleanly bypassed with env vars once triggered.

**How to apply:** If EAS/expo-updates isn't actually used in the project (check `package.json` for `expo-updates` and grep for `getExpoPushTokenAsync`/`projectId` usage), just delete `extra.eas` and `updates` from `app.json` — Expo Go stops requesting signature entirely and dev connections work normally. Don't leave `EXPO_OFFLINE=1` set as a workaround; it has side effects (e.g. "Skipping dependency validation") and isn't the real fix.
