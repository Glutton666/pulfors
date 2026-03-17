# Metronome App

## Overview

This is a **Metronome** mobile application built with **Expo (React Native)** and an **Express** backend server. The app provides a musical metronome with features like adjustable BPM, tempo presets (Largo through Presto), time signatures, beat visualization with a pendulum animation, haptic feedback, and audio click generation. Settings are persisted locally using AsyncStorage. On first launch, an **Onboarding Flow** (`components/OnboardingModal.tsx`) guides users through 5 steps: (1) theme color selection (Gold, Green, Orange, Blue, Rose), (2) activity logging explanation (why/how with toggle), (3) haptic feedback mode (all/accent/off with live demo bar preview), (4) screen flash mode (all/accent/off with live demo bar preview), (5) profile setup (nickname + practice room with auto-location hint). Each demo preview plays a 4-beat pattern (Strong, Accent, Normal, Mute) at 100 BPM showing the effect in real-time. Skip is available at any step. Existing users (who have `metronome_settings` or `metronome_theme_color` in AsyncStorage) skip onboarding automatically. The side panel includes a **Stopwatch** and **Timer**. The hamburger menu includes a **Practice Note** for saving, labeling, and managing both beat mode and bar mode configurations (BPM, time signature, beat types, subdivisions, loop blocks, loop mode). Each saved entry includes a `mode` field ("beat" or "bar") — entries without the field default to "bar" for backward compatibility. Beat mode entries display a blue "BEAT" badge, bar mode entries show the accent color "BAR" badge. Saved entries can be loaded to restore the corresponding mode setup, automatically switching between beat and bar modes as needed. The menu also includes **Work Up Overview** — an activity logging system that tracks practice sessions (BPM, mode, duration, bar config) and feature usage (tuner, signal generator, practice note) with opt-in logging toggle in Settings (disabled by default). Includes goal management for daily practice time, daily sessions, and target BPM with progress tracking. Activity logs are persisted via AsyncStorage with minimum thresholds (3s for practice, 2s for features). The Work Up Overview also features **Practice Room location tracking** — users can register their current GPS location as a practice room (via `expo-location`), and the app automatically tracks time spent at registered rooms using periodic foreground location checks (every 30s, 100m radius, 10s minimum visit threshold). Visit stats are displayed per room with total duration and visit count.

The **Loop System** has three key features:
- **Progress indicators**: During playback, individual bar repeats show current/total iteration (e.g., "2/4"), and block loop chips show their iteration progress as a highlighted badge
- **Block jump**: Each block loop can specify a "jump to" target block. After completing its iterations, playback jumps to the target block (with infinite loop detection via visited set). The block editor shows numbered buttons to select the jump target
- **Per-bar BPM override**: Each individual bar repeat can have its own BPM setting (via `BarRepeat.bpm` field). The engine uses `barBpmOverrides` map to calculate per-beat timing in `buildSchedule`. The repeat modal includes a BPM Override section with +/- buttons and direct input

The Work Up Overview features a modern Nike/Samsung Health-inspired card-based UI with:
- Goals at the top (total/beat/bar mode play time) with circular progress indicators
- Donut chart showing beat vs bar mode time distribution
- Weekly summary with total/beat/bar breakdowns
- Expandable session details (+) showing BPM-grouped beat sessions, bar mode config sessions, and feature usage
- Practice room management with manual start/stop tracking (20m radius geofence, 15s check interval)

The project follows a full-stack architecture where the Express server can serve both the API and a static web build, while the mobile app runs via Expo. The backend includes a PostgreSQL database schema (via Drizzle ORM) with a basic user model, though the core metronome functionality is entirely client-side.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)
- **Framework**: Expo SDK 54 with React Native 0.81, using the new architecture
- **Routing**: `expo-router` with file-based routing (app directory). Currently a single-screen app (`app/index.tsx`) with the metronome UI
- **State Management**: Local React state (`useState`, `useRef`) for metronome state. `@tanstack/react-query` is set up for server data fetching but not heavily used since the metronome is client-side
- **Animations**: `react-native-reanimated` powers the pendulum swing and beat indicator animations
- **Audio**: `expo-audio` for click sounds. The audio system uses a **non-blocking two-phase approach**: (1) immediate per-tick playback starts instantly when the user presses play (zero startup delay), then (2) a pre-rendered WAV buffer is built asynchronously in the background (via `lib/audio-renderer.ts` `renderMeasure`). Once ready, it seeks to the correct position using `engine.getMeasureElapsedMs()` and seamlessly takes over. Audio players are warmed up eagerly on component mount (500ms after init). If pre-rendering fails, per-tick audio continues as a reliable fallback
- **Haptics**: `expo-haptics` provides tactile feedback on beats
- **Fonts**: Space Grotesk (Google Fonts) loaded via `@expo-google-fonts/space-grotesk`
- **Persistence**: `@react-native-async-storage/async-storage` stores BPM, beats per measure, and subdivisions locally
- **UI Components**: Custom components for Pendulum (`components/Pendulum.tsx`), BeatIndicator (`components/BeatIndicator.tsx`), with a dark theme defined in `constants/colors.ts`
- **Error Handling**: Class-based `ErrorBoundary` component wrapping the app

### Backend (Express)
- **Framework**: Express 5 with TypeScript, compiled via `esbuild` for production or run with `tsx` in development
- **API Structure**: Routes registered in `server/routes.ts`, prefixed with `/api`. Currently minimal — the placeholder user CRUD is defined but no metronome-specific API routes exist
- **Storage Layer**: `server/storage.ts` defines an `IStorage` interface with an in-memory implementation (`MemStorage`). This abstraction allows swapping to a database-backed implementation
- **Static Serving**: In production, the server serves a static web build of the Expo app. In development, it proxies to the Expo dev server using `http-proxy-middleware`
- **CORS**: Dynamic CORS configuration supporting Replit domains and localhost origins for development

### Database
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: Defined in `shared/schema.ts` — currently only a `users` table with `id`, `username`, and `password` fields. Uses `drizzle-zod` for insert schema validation
- **Migrations**: Output to `./migrations` directory, managed via `drizzle-kit`
- **Note**: The database is configured but the app currently uses in-memory storage (`MemStorage`). The metronome itself doesn't require server-side persistence — settings are stored on-device via AsyncStorage

### Build & Deployment
- **Development**: Two processes — `expo:dev` for the mobile/web client, `server:dev` for the Express API
- **Production Build**: Custom build script (`scripts/build.js`) bundles the Expo web app as static files, then `server:build` compiles the Express server with esbuild
- **Production Run**: `server:prod` serves the static build and API from a single Express server
- **Database Push**: `db:push` uses drizzle-kit to push schema changes to PostgreSQL

### Path Aliases
- `@/*` maps to project root
- `@shared/*` maps to `./shared/*` for sharing types/schemas between client and server

## External Dependencies

- **PostgreSQL**: Database configured via `DATABASE_URL` environment variable (required by drizzle config, used for user storage)
- **Replit Environment**: The app relies on Replit-specific env vars (`REPLIT_DEV_DOMAIN`, `REPLIT_DOMAINS`, `REPLIT_INTERNAL_APP_DOMAIN`) for CORS, proxy configuration, and deployment URLs
- **Google Fonts**: Space Grotesk font family loaded at runtime via `@expo-google-fonts/space-grotesk`
- **No external APIs**: The metronome functionality is entirely self-contained with client-side audio generation and local storage

## Internationalization (i18n)

The app supports **Korean (한국어)** and **English** with Korean as the default language.

### Architecture
- **`lib/i18n.ts`**: Central translation file with all EN/KO string maps organized by section (e.g., `main`, `settings`, `onboarding`, `practiceBook`, `workUp`, `signalGenerator`, `noteRecorder`, `stopwatch`). Exports `createT(lang)` factory, `getTempoLabel(bpm, lang)`, and `formatDurationLocalized(seconds, lang)`.
- **`contexts/LanguageContext.tsx`**: React context providing `language` state and `t(section, key)` translation function. Language persisted in AsyncStorage under `metronome_language` key.
- **Usage pattern**: Components call `const { language, t } = useLanguage();` then use `t("section", "key")` for translated strings.
- **Notification controls** (`lib/notification-controls.ts`): Accept optional `lang: Language` parameter (default `"ko"`). In `app/index.tsx`, a `languageRef` (updated via useEffect) passes current language to notification calls from callbacks/effects.
- **Language picker**: Located in `components/SettingsModal.tsx` Theme tab, with "한국어" / "English" toggle buttons.

## Custom Sound Sets

Users can create up to 3 custom sound sets in the Sound tab of Settings. Each custom set allows mixing samples from the 4 built-in sets (Classic, Woodblock, Digital, Rimshot) for each role (Strong, Accent, Normal), with per-sample duration control (0.1~3.0s). Each sample slot can also use user-recorded audio (via microphone, max 3s) or imported audio files (via document picker). The `CustomSoundSample` type is a discriminated union: `type: "builtin"` (sourceSet + sourceRole) or `type: "custom"` (sampleUri + sampleName).

### Architecture
- **`lib/storage.ts`**: Defines `CustomSoundSetConfig`, `CustomSoundSample`, `BuiltinSoundSet`, `SoundRole` types. Custom configs stored in AsyncStorage under `metronome_custom_sound_sets` key. Up to 3 slots: `custom1`, `custom2`, `custom3`.
- **`components/SettingsModal.tsx`**: Inline editor in Sound tab — source type toggle (Built-in / Record+File), source set picker, role picker, duration +/- buttons, mic recording with timer, file import via `expo-document-picker`, preview, save/delete. Recording uses `expo-av` Audio.Recording (max 3s, auto-stop).
- **`app/index.tsx`**: Custom set audio routing via `getCustomPlayer()` helper. For builtin samples, maps to built-in set players. For custom audio samples, falls back to classic players for real-time playback (PCM rendering handles custom URIs properly via `decodeSampleFile`). PCM rendering trims audio to specified duration with 10ms fade-out via `trimPCM()`. PCM cache invalidated on custom set changes.

## Web Gesture Handling (SubdivisionBar)

The `SubdivisionBar` component uses platform-specific gesture handling:
- **Native (iOS/Android)**: Uses PanResponder for swipe (add/remove cells), drag-up (reorder), and shake-to-reset gestures via accelerometer
- **Web**: Uses pointer events (pointerdown/pointermove/pointerup) attached to a wrapper `<View ref={webContainerRef}>` element. The useEffect that sets up listeners uses an empty dependency array (`[]`) with callback refs (`trackShakeRef`, `triggerResetRef`, `addCellRef`, `removeCellRef`) to prevent React re-renders from tearing down/re-attaching listeners mid-gesture. Shake detection requires 4 direction changes within 2000ms.

## Mode-Switching State Preservation

The app has two independent modes — **Beat Mode** (dial) and **Bar Mode** — each with their own configuration ref:
- **`dialConfigRef`**: Stores `beatsPerMeasure`, `beatTypes`, `beatSubdivisions`, `noteSamples`, `noteSampleNames`, `noteSampleSources`
- **`barConfigRef`**: Stores all dial fields plus `barRepeats`, `loopBlocks`, `barClockMode`, `barTimerDuration`, `barLoopMode`, `hasBeenConfigured`

When switching modes, the current config is saved to the appropriate ref and the other mode's config is restored. The `hasBeenConfigured` flag on barConfigRef ensures first-time bar mode entry uses defaults, while subsequent entries restore previous settings. All assignments to these refs use spread operators to preserve fields not explicitly overwritten.

## Backup & Sharing

The app supports full data backup/restore and individual practice entry sharing.

### Architecture
- **`lib/backup.ts`**: Core backup utilities. `exportBackup()` collects all 15 AsyncStorage keys into a single JSON file with metadata (app name, version, creation date, key count). `importBackup()` reads a backup file and restores all data with overwrite confirmation. `sharePracticeEntry()` exports a single practice entry as a shareable JSON file. `importPracticeEntry()` imports a practice entry from file and adds it to the practice book.
- **File formats**: Full backup uses `.metronome.json` extension. Practice entries use `.metronome-practice.json` extension. Both include `_meta` headers for validation.
- **Platform support**: Web uses Blob download/file input. Native (iOS/Android) uses `expo-sharing` and `expo-document-picker`.
- **UI**: Backup/restore buttons in Settings → Profile tab under "데이터 백업" section. Practice entry import button (download icon) next to save button in Practice Book modal. Share button on each practice entry via swipe actions.

### Backed up data (15 keys)
`metronome_settings`, `practice_book`, `metronome_custom_sound_sets`, `metronome_practice_rooms`, `metronome_theme_color`, `metronome_custom_hex`, `metronome_hub_images`, `metronome_language`, `metronome_activity_log`, `metronome_activity_settings`, `metronome_goals`, `@note_samples`, `@note_sample_names`, `@note_sample_sources`, `metronome_onboarding_done`

## Security

- `tar` package overridden to `>=7.5.10` in package.json for CVE fix