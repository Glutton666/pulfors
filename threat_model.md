# Threat Model

## Project Overview

This project is a metronome application built with Expo/React Native and a small Express backend. In production, the mobile or web client is the primary user-facing app, while the Express server serves the landing page, static web assets, and a single public audio-analysis API at `POST /api/analyze-audio`.

Production-relevant data is mostly stored on the client device rather than in a backend database. The app persists settings, practice entries, activity logs, imported/recorded audio sample references, onboarding state, and practice-room location data in local storage. The server does not currently implement user authentication or a multi-user account system.

Assumptions for this scan: only production-reachable code matters; mockup/sandbox code is out of scope; `NODE_ENV` is `production` in deployed environments; Replit provides TLS for client-server traffic.

## Assets

- **Local user data** -- metronome settings, practice-book entries, note queues, activity logs, goals, imported recordings, and screenshots. Tampering or disclosure affects user privacy and data integrity.
- **Practice-room location data** -- stored latitude/longitude pairs tied to named practice rooms. This is sensitive location information.
- **Imported and recorded audio files** -- user-controlled media that crosses file-system and parsing boundaries on both client and server.
- **Custom sound-set configuration** -- imported sample URIs and playback metadata that later drive preview and rendering behavior. If untrusted values cross into runtime playback code, the app can be tricked into making unintended network requests or loading hostile media locations.
- **Application availability** -- the audio-analysis API and static asset server are the only network-exposed backend surfaces. Resource exhaustion on these paths can take the product offline.
- **Origin integrity of the landing page** -- the `/` page runs browser JavaScript on the same origin as the backend and static app assets.

## Trust Boundaries

- **Client to server** -- the mobile/web app sends untrusted requests to the Express server, especially `POST /api/analyze-audio`. The server must treat all body fields, headers, and content types as attacker-controlled.
- **User-selected file to app storage** -- backup and practice-entry import flows accept attacker-controlled JSON and embedded audio files from local files or share sheets, then write them into app storage and the app sandbox.
- **Imported configuration to runtime media playback** -- backup-restored custom sound sets and stored sample metadata are later consumed by preview and rendering code. Imported URIs must remain constrained to local media schemes when replayed at runtime.
- **Imported image metadata to runtime rendering** -- backup-restored hub images and practice-entry thumbnails are later passed into React Native `Image` components. Imported image URIs must stay constrained to safe local schemes so the app does not make attacker-chosen network requests from the user's device or browser.
- **Deep link / URL to app state** -- `/practice?d=...` and `pulfors://practice?...` feed attacker-controlled JSON into runtime state and persistence logic. Imported fields must be schema-checked before they are applied, saved, or used as media URIs.
- **App storage to runtime logic** -- AsyncStorage-backed settings, practice data, and note sample URIs are trusted later by rendering, sharing, and playback code.
- **Server to host filesystem / native tools** -- the backend writes temporary files and invokes `ffmpeg` on user-supplied media. File paths, input size, and processing cost matter here.
- **Browser to third-party CDN** -- the landing page loads an external QR code script, so integrity of that dependency affects the application origin.

## Scan Anchors

- **Production entry points:** `app/_layout.tsx`, `app/index.tsx`, `app/practice.tsx`, `server/index.ts`, `server/routes.ts`
- **Highest-risk code areas:** `server/index.ts`, `server/routes.ts`, `server/templates/landing-page.html`, `lib/backup.ts`, `lib/backup/full.ts`, `lib/backup/practice.ts`, `lib/backup/shared.ts`, `lib/pending-import.ts`, `contexts/ThemeContext.tsx`, `components/SettingsModal.tsx`, `components/BeatIndicator.tsx`, `components/NoteModeView.tsx`, `components/SignalGeneratorModal.tsx`, `components/MicWebView.tsx`, `lib/practice-room.ts`, `lib/audio-renderer.ts`, `lib/storage.ts`
- **Public surfaces:** `/`, `/manifest`, static asset serving, `/practice`, custom-scheme deep links, and `POST /api/analyze-audio`
- **Authenticated/admin surfaces:** none currently implemented in production
- **Usually dev-only / ignore unless proven reachable:** `scripts/`, build helpers, generated assets, Expo dev-server behavior

## Threat Categories

### Tampering

The biggest tampering risk is the import pipeline. Backup files, shared practice-entry files, and deep-linked practice payloads are user-controlled JSON blobs that can overwrite stored keys, replace previously trusted note-sample references, and restore embedded audio files into the local filesystem. The app must validate imported structure, constrain restored filenames and paths, and ensure imported data cannot modify unrelated stored data.

### Information Disclosure

The main disclosure risks are local rather than server-side. Practice-room coordinates, activity logs, usernames, and imported media are stored in client-side storage and can also be packaged into share/backup exports. Deep-linked or imported media URIs must not cause the app to leak user reachability or internal-network access by fetching attacker-controlled URLs, including when restored custom sound-set entries, hub images, or practice-entry thumbnails are rendered later in the app.

### Denial of Service

The server exposes a public audio-analysis endpoint that accepts attacker-controlled media, performs CPU-intensive analysis, writes temporary files, and may invoke `ffmpeg`. The service must bound request size, processing cost, decoded duration, and request rate so a remote attacker cannot monopolize CPU, memory, subprocess slots, or disk I/O. The import pipeline also needs size and count limits so one malicious backup cannot permanently degrade the client.

### Elevation of Privilege

There is no production user/account permission model today, so classic role-escalation threats are limited. The relevant privilege boundary is instead between untrusted imported content and privileged app/server operations: imported files must not gain filesystem access beyond their intended directory, and untrusted network input must not reach native tools or file APIs in dangerous ways.
