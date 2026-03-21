# Metronome App

## Overview

This project is a Metronome mobile application built with Expo (React Native) and an Express backend server. Its primary purpose is to provide musicians with a comprehensive metronome tool. Key capabilities include adjustable BPM, tempo presets, time signatures, visual beat feedback (pendulum animation, screen flash), haptic feedback, and audio click generation. Settings are persisted locally, and the app features an onboarding flow for new users, guiding them through theme selection, activity logging opt-in, feedback modes, and profile setup.

The app also incorporates advanced features such as:
- A **Loop System** with progress indicators, block-jumping logic, and per-bar BPM overrides.
- A **Practice Note** system for saving and managing complex beat and bar mode configurations.
- A **Note Mode** that queues bar mode practice entries for sequential, loop, or random playback — with save/reset/share support and a NOTE badge in the practice book.
- A **Work Up Overview** for tracking practice sessions, feature usage, and managing goals, including GPS-based practice room location tracking.
- Support for **custom sound sets**, allowing users to mix built-in samples, record audio, or import files.
- **Data backup and sharing** functionality for all user data and individual practice entries, including embedded audio files.

The business vision is to provide a robust and feature-rich metronome experience for musicians, enhancing practice efficiency and tracking progress.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)
- **Framework**: Expo SDK 54 with React Native 0.81 (new architecture).
- **Routing**: `expo-router` for file-based routing.
- **State Management**: Local React state for core metronome logic; `@tanstack/react-query` for server data.
- **Animations**: `react-native-reanimated` for beat visualization.
- **Audio**: `expo-audio` with a non-blocking two-phase audio system (immediate per-tick playback followed by asynchronous pre-rendered WAV buffer takeover). Custom sound sets use `expo-av` for recording and `expo-document-picker` for importing.
- **Haptics**: `expo-haptics` for tactile feedback.
- **Persistence**: `@react-native-async-storage/async-storage` for local data persistence (BPM, settings, activity logs, custom sound sets, practice rooms, language).
- **UI/UX**: Custom components for visual elements (Pendulum, BeatIndicator) with a dark theme. Onboarding flow guides initial setup including theme and feedback options. The Work Up Overview features a card-based UI with circular and donut progress indicators. Responsive layout with tablet optimization (maxWidth content, scaled-up dial) and landscape mode (horizontal split: 3/5 beat indicator, 2/5 BPM controls). Landscape mode features: menu button repositioned to top-left, inline compact StopwatchTimer above subdivision bar, scaled-down BPM slider (0.75x), configurable layout reversal and beat direction (CW/CCW) via settings.
- **Responsive Design**: `lib/scale.ts` provides `IS_TABLET`, `CONTENT_MAX_WIDTH`, and `moderateScale` for responsive sizing. Landscape detection via `useWindowDimensions` in `app/index.tsx` enables horizontal layout splitting.
- **Internationalization**: Full Korean/English i18n support via `LanguageContext` and `lib/i18n.ts`. All UI strings across menus, modals, and components use `t("section", "key")` translation calls.
- **Note Recorder**: Recording countdown uses BPM-synced 4-beat count-in with metronome click sounds. Click sounds continue during recording so users can record in time with the beat.
- **Mode Switching**: Preserves distinct configurations for "Beat Mode" and "Bar Mode" using separate configuration refs, ensuring seamless transitions while maintaining user settings.
- **Gesture Handling**: `SubdivisionBar` uses platform-specific gestures (PanResponder for native, pointer events for web) for cell manipulation, reordering, and shake-to-reset.

### Backend (Express)
- **Framework**: Express 5 with TypeScript.
- **API Structure**: Routes defined in `server/routes.ts`, prefixed with `/api`.
- **Storage Layer**: Abstracted `IStorage` interface with an in-memory `MemStorage` implementation, designed for database integration.
- **Deployment**: Serves static web build of the Expo app in production; proxies to Expo dev server in development.

### Database
- **ORM**: Drizzle ORM with PostgreSQL dialect.
- **Schema**: `shared/schema.ts` defines a `users` table.
- **Migrations**: Managed via `drizzle-kit`.
- **Note**: Currently uses in-memory storage for core functionality; database is set up for future server-side persistence.

### Build & Deployment
- **Development**: Separate processes for client (`expo:dev`) and server (`server:dev`).
- **Production**: Custom build scripts (`scripts/build.js`) for bundling, `esbuild` for server compilation. Single Express server for static assets and API.
- **Path Aliases**: `@/*` for project root, `@shared/*` for shared client/server code.

## External Dependencies

- **PostgreSQL**: Used for database schema and potential future server-side user data.
- **Replit Environment**: Utilizes Replit-specific environment variables for CORS, proxying, and deployment.
- **Google Fonts**: Space Grotesk font loaded via `@expo-google-fonts/space-grotesk`.
- **expo-location**: For GPS-based practice room tracking.
- **expo-sharing**: For sharing backup files and practice entries on native platforms.
- **expo-document-picker**: For importing audio files and backup files.