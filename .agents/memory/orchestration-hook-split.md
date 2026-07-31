---
name: Orchestration hook domain split
description: How useMetronomeScreen.ts was split into focused domain hooks — patterns and constraints for future extractions.
---

# Orchestration hook domain split

## Rule
Four domain hooks were extracted from `useMetronomeScreen.ts`: `useAudioPipeline`, `useKeyboardShortcuts`, `useLandscapePanel`, `useNotificationBridge`. Always destructure with the same names so the main hook's return statement and all internal references need zero changes.

**Why:** The hook is still ~4,285 lines (was 5,249) because bar-mode/note-mode are tightly coupled to `togglePlayPause`. The four extracted domains are genuinely independent — they can be extracted without touching `togglePlayPause`.

**How to apply:**
- Declare shared refs (`bpmRef`, `barModeRef`) early — before the first hook that needs them — not at the point they were first used.
- Use `useCallback` with `[]` dep-array in extracted hooks for stable function refs; the init `useEffect` in the main hook (also `[]`) will capture them correctly.
- Use `TranslationFn` from `@/lib/i18n` (not the loose `(ns, key) => string`) in any hook that receives the `t` function.
- Cast `languageRef.current` to `"ko" | "en" | undefined` at call sites for notification-controls functions.
- For the keyboard hook, the dep array is `[]` — all mutable state flows through stable refs passed as params.

## File sizes after extraction
- `useMetronomeScreen.ts`: ~4,285 lines (was 5,249)
- `useAudioPipeline.ts`: ~516 lines
- `useKeyboardShortcuts.ts`: ~379 lines
- `useLandscapePanel.ts`: ~126 lines
- `useNotificationBridge.ts`: ~178 lines
