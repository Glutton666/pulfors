# Metronome App

## Overview

This project is a Metronome mobile application built with Expo (React Native) and an Express backend server. Its primary purpose is to provide musicians with a comprehensive metronome tool. Key capabilities include adjustable BPM, tempo presets, time signatures, visual beat feedback (pendulum animation, screen flash), haptic feedback, and audio click generation. Settings are persisted locally, and the app features an onboarding flow for new users, guiding them through theme selection, activity logging opt-in, feedback modes, and profile setup.

The app also incorporates advanced features such as:
- A **Loop System** with progress indicators, block-jumping logic, and per-bar BPM overrides.
- A **Practice Note** system for saving and managing complex beat and bar mode configurations.
- A **Note Mode** that queues bar mode practice entries for sequential, loop, or random playback — with save/reset/share support and a NOTE badge in the practice book. Includes a 3x3 control pad: assign 9 bar entries before playback (tap empty slot → modal picker; long-press to clear), then during playback toggle ON to tap a mapped slot and append that entry to the end of the queue. Mapping persists to AsyncStorage (`metronome_control_pad_mapping_v1`).
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
- **Notification Controls**: `expo-notifications` provides a persistent notification with Play/Pause and BPM ±1/±5 buttons (single tap = ±1, double tap within 300ms = ±5). The notification handler uses `engine.getIsRunning()` for reliable state detection and starts per-tick audio directly (no async pre-rendering) for reliable background operation.
- **Persistence**: `@react-native-async-storage/async-storage` for local data persistence (BPM, settings, activity logs, custom sound sets, practice rooms, language).
- **UI/UX**: Custom components for visual elements (Pendulum, BeatIndicator) with a dark theme. Onboarding flow guides initial setup including theme and feedback options. The Work Up Overview features a card-based UI with circular and donut progress indicators. Responsive layout with tablet optimization (maxWidth content, scaled-up dial) and landscape mode (horizontal split: 3/5 beat indicator, 2/5 BPM controls). Landscape mode features: menu button repositioned to top-left, inline compact StopwatchTimer above subdivision bar, scaled-down BPM slider (0.75x), configurable layout reversal and beat direction (CW/CCW) via settings.
- **Responsive Design**: `lib/scale.ts` provides both static exports (`IS_TABLET`, `CONTENT_MAX_WIDTH`, `moderateScale`) for backward compatibility and a dynamic `useScale()` hook that returns `ScaleValues` (including `ms()`, `dialSize`, `dialRadius`, `dotRadiusFromCenter`, `dotSize`, `isLandscape`, `isTablet`, `contentMaxWidth`). The hook uses `useWindowDimensions()` for live orientation/size tracking. Dial sizing accounts for web insets (`WEB_INSET_VERT=101px` on web, 0 on native), container width constraints (landscape mode buttons space), and portrait flex area calculations. Components use the `make_styles(C, S)` pattern where `S` is from `useScale()`. Content containers use `overflow: "hidden"` as a safety net against edge-case overflow. Landscape detection via `useWindowDimensions` in `app/index.tsx` enables horizontal layout splitting.
- **Internationalization**: Full Korean/English i18n support via `LanguageContext` and `lib/i18n.ts`. All UI strings across menus, modals, and components use `t("section", "key")` translation calls.
  - **i18n 검증 (3단계)**:
    1. `translations`에 `satisfies` 적용 + `TranslationLeaf = Record<LanguageCode, string>` → 새 언어 추가 시 컴파일 에러.
    2. `tests/i18n-meta.test.ts` + `tests/i18n-completeness.test.ts`가 키 셋 동치성/공백 방지를 `SUPPORTED_LANGUAGES` 순회로 검증.
    3. `npx tsx scripts/check-i18n-keys.ts`가 코드의 정적 `t("ns","key")` 호출을 검증(누락 시 exit 1). 런타임은 `createT`가 dev 모드에서 누락/폴백을 `console.warn` + Sentry breadcrumb으로 1회 보고.
  - **새 언어 추가 절차** (자세한 예시는 `docs/i18n-add-language.md`):
    1. `lib/i18n.ts` `SUPPORTED_LANGUAGES`에 코드 추가 (예: `"ja"`).
    2. `LANGUAGE_LABELS`에 표시 라벨 추가.
    3. `tsc --noEmit`이 가리키는 모든 leaf에 새 언어 문자열 채우기.
    4. 메타/완성도 테스트 + `check-i18n-keys` 실행.
    UI 옵션(`LANGUAGE_OPTIONS`), 디바이스 로케일 감지(`detectDeviceLanguage`), 저장값 검증(`isLanguageCode`)은 자동 적용되므로 추가 분기 불필요.
- **Note Recorder**: Recording countdown uses BPM-synced 4-beat count-in with metronome click sounds. Click sounds continue during recording so users can record in time with the beat.
- **권한 거부 자동 회복**: `lib/permissions.ts`의 `ensurePermission`은 `pendingAction` 옵션을 받아 사용자가 OS 설정에서 권한을 켜고 앱으로 복귀했을 때 직전 시도(녹음 시작·사진 선택 등)를 자동으로 이어서 실행한다. 회복 트리거는 `app/index.tsx`의 AppState `active`(또는 web `visibilitychange`) 리스너에서 `tryRecoverPermissionActions()`를 호출하며, 짧은 토스트로 결과를 알린다. 두 번 연속 거부 또는 5분 TTL 초과 시 pending이 자동 정리된다.
- **Mode Switching**: Preserves distinct configurations for "Beat Mode" and "Bar Mode" using separate configuration refs, ensuring seamless transitions while maintaining user settings.
- **Gesture Handling**: `SubdivisionBar` uses platform-specific gestures (PanResponder for native, pointer events for web) for cell manipulation, reordering, and shake-to-reset.

### Backend (Express)
- **Framework**: Express 5 with TypeScript.
- **API Structure**: Routes defined in `server/routes.ts`, prefixed with `/api`.
- **Active endpoints**:
  - `GET /` — serves the landing page (`server/templates/landing-page.html`) or the Expo OTA manifest when an `expo-platform` header is present.
  - `GET /manifest` — same Expo manifest routing as `/`.
  - `POST /api/analyze-audio` — accepts a base64-encoded audio clip, detects dominant frequency/note and BPM candidates. WAV files are analyzed in a Node.js worker thread; other formats (m4a, webm, etc.) are converted via `ffmpeg`. Includes per-IP rate limiting (20 req/60 s) and concurrency caps.
- **No database**: All user data (settings, practice entries, sound sets, etc.) is stored on-device via AsyncStorage. The server holds no persistent state.
- **Deployment**: Serves the static Expo web build from `static-build/` in production; in development the Expo dev server runs separately on port 8081.

### Database
- **Not implemented**: There is no active database connection. The server is stateless — no ORM, no schema, no migrations. If server-side persistence is needed in the future (e.g. user accounts, cloud sync), add Drizzle ORM + PostgreSQL at that point.

### Build & Deployment
- **Development**: Separate processes for client (`expo:dev`) and server (`server:dev`).
- **Production**: Custom build scripts (`scripts/build.js`) for bundling, `esbuild` for server compilation. Single Express server for static assets and API.
- **Path Aliases**: `@/*` for project root, `@shared/*` for shared client/server code.

## External Dependencies

- **Replit Environment**: Utilizes Replit-specific environment variables for CORS, proxying, and deployment.
- **Google Fonts**: Space Grotesk font loaded via `@expo-google-fonts/space-grotesk`.
- **expo-location**: For GPS-based practice room tracking.
- **expo-sharing**: For sharing backup files and practice entries on native platforms.
- **expo-document-picker**: For importing audio files and backup files.
- **react-native-webview**: Used for Android offline microphone analysis via Web Audio API in a hidden WebView (components/MicWebView.tsx). iOS uses native WAV recording + local analysis; web uses Web Audio API directly.

## Behavior Notes

- **Per-bar BPM override (`PracticeEntry.barRepeats[*].bpm`)**: Only positive numbers are honored. `0`, negative values, and missing fields are treated as "no override" by both `applyEntryToEngine` and `applyEntryToState` (app/index.helpers.ts). This prevents the engine's 20–300 clamp from silently rewriting `0` into `20`. Pre–Task #37 inline code used a JS truthy check, which had the same effect for falsy values; the helper formalizes that policy.