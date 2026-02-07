# Metronome App

## Overview

This is a **Metronome** mobile application built with **Expo (React Native)** and an **Express** backend server. The app provides three integrated tools: a **Metronome** with adjustable BPM, swipeable beat control (1-12 beats), tempo labels, haptic feedback, and audio click generation; a **Stopwatch** with lap timing and best/worst lap highlighting; and a **Timer** with preset durations that integrates with the metronome — when the timer expires, the metronome gracefully completes its current measure before stopping. Settings are persisted locally using AsyncStorage.

The project follows a full-stack architecture where the Express server can serve both the API and a static web build, while the mobile app runs via Expo. The backend includes a PostgreSQL database schema (via Drizzle ORM) with a basic user model, though the core functionality is entirely client-side.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)
- **Framework**: Expo SDK 54 with React Native 0.81, using the new architecture
- **Routing**: `expo-router` with file-based routing and tab navigation (`app/(tabs)/`). Three tabs: Metronome (`index.tsx`), Stopwatch (`stopwatch.tsx`), Timer (`timer.tsx`)
- **State Management**: Local React state (`useState`, `useRef`) for metronome state. `@tanstack/react-query` is set up for server data fetching but not heavily used since the metronome is client-side
- **Animations**: `react-native-reanimated` powers the pendulum swing and beat indicator animations
- **Audio**: `expo-audio` (`useAudioPlayer`) for click sounds. The metronome engine (`lib/metronome-engine.ts`) generates WAV audio buffers programmatically (high/low click sounds) rather than using pre-recorded audio files
- **Haptics**: `expo-haptics` provides tactile feedback on beats
- **Fonts**: Space Grotesk (Google Fonts) loaded via `@expo-google-fonts/space-grotesk`
- **Persistence**: `@react-native-async-storage/async-storage` stores BPM, beats per measure, and subdivisions locally
- **UI Components**: Custom components for BeatIndicator (`components/BeatIndicator.tsx`), BpmSlider (`components/BpmSlider.tsx`), with a dark theme defined in `constants/colors.ts`
- **MetronomeEngine**: `lib/metronome-engine.ts` supports `stopAfterMeasure()` to gracefully complete the current measure before stopping (used by Timer integration)
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