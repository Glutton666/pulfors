import { useEffect } from "react";
import { Platform } from "react-native";
import {
  matchesBinding,
  isEditableTarget,
  type KeyBindingsMap,
  type NormalizedKeyEvent,
} from "@/lib/keyboard-bindings";
import type { MetronomeEngine, BeatType } from "@/lib/metronome-engine";
import type { StopwatchTimerHandle } from "@/components/StopwatchTimer";
import type { ActiveModal } from "@/lib/modal-routing";
import type { DebouncedPersister } from "@/lib/persist";
import type { MetronomeSettings } from "@/lib/storage";

interface UseKeyboardShortcutsParams {
  // Stable refs — all captured at mount time (dep array is [])
  keyBindingsRef: React.MutableRefObject<KeyBindingsMap>;
  bpmRef: React.MutableRefObject<number>;
  updateBpmRef: React.MutableRefObject<(bpm: number) => void>;
  beatsPerMeasureRef: React.MutableRefObject<number>;
  updateTimeSignatureRef: React.MutableRefObject<(beats: number) => void>;
  barModeRef: React.MutableRefObject<boolean>;
  noteModeRef: React.MutableRefObject<boolean>;
  stopwatchTimerRef: React.MutableRefObject<StopwatchTimerHandle | null>;
  stopwatchTimerLandscapeRef: React.MutableRefObject<StopwatchTimerHandle | null>;
  subdivisionPatternRef: React.MutableRefObject<BeatType[]>;
  beatTypesRef: React.MutableRefObject<BeatType[]>;
  handleNoteTogglePlayRef: React.MutableRefObject<(() => void) | null>;
  anyModalOpenRef: React.MutableRefObject<boolean>;
  showKbShortcutsRef: React.MutableRefObject<boolean>;
  showNativeKbHintRef: React.MutableRefObject<boolean>;
  engineRef: React.MutableRefObject<MetronomeEngine | null>;
  nativeKbDownRef: React.MutableRefObject<((e: NormalizedKeyEvent) => void) | null>;
  nativeKbUpRef: React.MutableRefObject<((e: NormalizedKeyEvent) => void) | null>;
  togglePlayPauseRef: React.MutableRefObject<() => void>;
  // Stable setters from useState (identity stable across renders)
  setNoteMode: (v: boolean) => void;
  setBarMode: (v: boolean) => void;
  setShowKbShortcuts: React.Dispatch<React.SetStateAction<boolean>>;
  setShowNativeKbHint: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveModal: React.Dispatch<React.SetStateAction<ActiveModal>>;
  setBarLoopMode: React.Dispatch<React.SetStateAction<"loop" | "once">>;
  setBlockPlayMode: React.Dispatch<React.SetStateAction<"sequential" | "loop" | "random">>;
  setBeatsPerMeasure: React.Dispatch<React.SetStateAction<number>>;
  setBeatTypes: React.Dispatch<React.SetStateAction<BeatType[]>>;
  setSubdivisionPattern: React.Dispatch<React.SetStateAction<BeatType[]>>;
  persistSettings: DebouncedPersister<MetronomeSettings>;
}

/**
 * Registers keyboard shortcut listeners for both web (window keydown/keyup) and
 * native (nativeKbDownRef / nativeKbUpRef). Extracted from useMetronomeScreen so
 * the ~300-line handler lives in one focused module.
 *
 * The effect has an empty dep array — all mutable state is accessed through stable
 * refs, so the listener is registered once at mount and cleaned up on unmount.
 */
export function useKeyboardShortcuts(params: UseKeyboardShortcutsParams): void {
  const {
    keyBindingsRef, bpmRef, updateBpmRef, beatsPerMeasureRef, updateTimeSignatureRef,
    barModeRef, noteModeRef, stopwatchTimerRef, stopwatchTimerLandscapeRef,
    subdivisionPatternRef, beatTypesRef, handleNoteTogglePlayRef, anyModalOpenRef,
    showKbShortcutsRef, showNativeKbHintRef, engineRef, nativeKbDownRef, nativeKbUpRef,
    togglePlayPauseRef, setNoteMode, setBarMode, setShowKbShortcuts, setShowNativeKbHint,
    setActiveModal, setBarLoopMode, setBlockPlayMode, setBeatsPerMeasure, setBeatTypes,
    setSubdivisionPattern, persistSettings,
  } = params;

  useEffect(() => {
    const repeatTimerRef = { current: null as ReturnType<typeof setInterval> | null };
    const heldKeyRef = { current: "" };
    const repeatCountRef = { current: 0 };

    const clearRepeat = () => {
      if (repeatTimerRef.current) { clearInterval(repeatTimerRef.current); repeatTimerRef.current = null; }
      heldKeyRef.current = "";
      repeatCountRef.current = 0;
    };

    const applyBpmDelta = (delta: number) => {
      updateBpmRef.current(bpmRef.current + delta);
    };

    const applyBeatDelta = (delta: number) => {
      updateTimeSignatureRef.current(beatsPerMeasureRef.current + delta);
    };

    const tapTimestamps: number[] = [];
    const TAP_RESET_MS = 2000;
    const TAP_MIN_TAPS = 2;

    const kb = () => keyBindingsRef.current;

    const handleKeyDown = (e: NormalizedKeyEvent) => {
      if (isEditableTarget(e)) return;

      const b = kb();
      const inNoteMode = noteModeRef.current;
      const inBarMode = barModeRef.current;
      const modalOpen = anyModalOpenRef.current;

      // Escape — priority: note mode → bar mode → shortcut modal → native hint → other modals
      if (matchesBinding(e, b.escape)) {
        if (inNoteMode) { e.preventDefault(); setNoteMode(false); return; }
        if (inBarMode) { e.preventDefault(); setBarMode(false); return; }
        if (showKbShortcutsRef.current) { e.preventDefault(); setShowKbShortcuts(false); return; }
        if (showNativeKbHintRef.current) { e.preventDefault(); setShowNativeKbHint(false); return; }
        if (modalOpen) return;
        return;
      }

      if (modalOpen) return;

      // Space — play/pause (note mode: toggle note playback)
      if (matchesBinding(e, b.playPause)) {
        e.preventDefault();
        if (inNoteMode && handleNoteTogglePlayRef.current) {
          handleNoteTogglePlayRef.current();
        } else {
          togglePlayPauseRef.current();
        }
        return;
      }

      // Note mode: only Space passes through
      if (inNoteMode) return;

      // Enter — confirm timer input if active, otherwise tap tempo
      if (matchesBinding(e, b.tapTempo)) {
        const swRef = stopwatchTimerRef.current || stopwatchTimerLandscapeRef.current;
        if (swRef?.isTimerInputActive()) {
          e.preventDefault();
          swRef.handleEnterKey();
          return;
        }
        e.preventDefault();
        const now = performance.now();
        if (tapTimestamps.length > 0 && now - tapTimestamps[tapTimestamps.length - 1] > TAP_RESET_MS) {
          tapTimestamps.length = 0;
        }
        tapTimestamps.push(now);
        if (tapTimestamps.length >= TAP_MIN_TAPS) {
          const intervals: number[] = [];
          for (let i = 1; i < tapTimestamps.length; i++) {
            intervals.push(tapTimestamps[i] - tapTimestamps[i - 1]);
          }
          const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
          const tapBpm = Math.round(60000 / avgMs);
          if (tapBpm >= 20 && tapBpm <= 300) {
            updateBpmRef.current(tapBpm);
          }
        }
        if (tapTimestamps.length > 8) tapTimestamps.splice(0, tapTimestamps.length - 8);
        return;
      }

      // Arrow Up/Down — beats ±1 (with key-repeat acceleration)
      if (matchesBinding(e, b.bpmUp) || matchesBinding(e, b.bpmDown)) {
        e.preventDefault();
        const delta = matchesBinding(e, b.bpmUp) ? 1 : -1;
        applyBeatDelta(delta);
        if (heldKeyRef.current !== e.code) {
          clearRepeat();
          heldKeyRef.current = e.code;
          repeatCountRef.current = 0;
          repeatTimerRef.current = setInterval(() => {
            repeatCountRef.current++;
            const d = repeatCountRef.current > 10 ? delta * 2 : delta;
            applyBeatDelta(d);
          }, 150);
        }
        return;
      }

      // Arrow Left/Right — BPM ±5 (with key-repeat acceleration)
      if (matchesBinding(e, b.bpmRight) || matchesBinding(e, b.bpmLeft)) {
        e.preventDefault();
        const delta = matchesBinding(e, b.bpmRight) ? 5 : -5;
        applyBpmDelta(delta);
        if (heldKeyRef.current !== e.code) {
          clearRepeat();
          heldKeyRef.current = e.code;
          repeatCountRef.current = 0;
          repeatTimerRef.current = setInterval(() => {
            repeatCountRef.current++;
            const step = repeatCountRef.current > 10 ? 20 : repeatCountRef.current > 5 ? 10 : 5;
            const d = matchesBinding(e, b.bpmRight) ? step : -step;
            applyBpmDelta(d);
          }, 120);
        }
        return;
      }

      // Tab — menu toggle
      if (matchesBinding(e, b.toggleMenu)) {
        e.preventDefault();
        setActiveModal((prev) => (prev === "menu" ? null : "menu"));
        return;
      }

      // W — stopwatch toggle
      if (matchesBinding(e, b.toggleStopwatch)) {
        e.preventDefault();
        const ref = stopwatchTimerRef.current || stopwatchTimerLandscapeRef.current;
        if (ref) ref.openStopwatch();
        return;
      }

      // T — timer toggle
      if (matchesBinding(e, b.toggleTimer)) {
        e.preventDefault();
        const ref = stopwatchTimerRef.current || stopwatchTimerLandscapeRef.current;
        if (ref) ref.openTimer();
        return;
      }

      // P — Practice Book
      if (matchesBinding(e, b.openPracticeBook)) {
        e.preventDefault();
        setActiveModal((prev) => (prev === "practiceBook" ? null : "practiceBook"));
        return;
      }

      // ? — shortcut list (web) / hint overlay (native)
      if (matchesBinding(e, b.showShortcuts) || (Platform.OS !== "web" && e.key === "?")) {
        e.preventDefault();
        if (Platform.OS === "web") {
          setShowKbShortcuts((prev) => !prev);
        } else {
          setShowNativeKbHint((prev) => !prev);
        }
        return;
      }

      // S/A/N/M — add beat (beat mode only, not while playing)
      const playing = engineRef.current?.getIsRunning() ?? false;
      if (!playing && !barModeRef.current && !noteModeRef.current) {
        const addBeatShortcuts: { binding: typeof b.addBeatStrong; type: BeatType }[] = [
          { binding: b.addBeatStrong, type: "strong" },
          { binding: b.addBeatAccent, type: "accent" },
          { binding: b.addBeatNormal, type: "normal" },
          { binding: b.addBeatMute,   type: "mute" },
        ];
        for (const { binding, type } of addBeatShortcuts) {
          if (matchesBinding(e, binding)) {
            e.preventDefault();
            const cur = beatsPerMeasureRef.current;
            if (cur < 16) {
              const newBeats = cur + 1;
              const newTypes: BeatType[] = [...beatTypesRef.current, type];
              setBeatsPerMeasure(newBeats);
              setBeatTypes(newTypes);
              engineRef.current?.setBeatsPerMeasure(newBeats);
              engineRef.current?.setBeatTypes(newTypes);
              if (!inBarMode) persistSettings({ beatsPerMeasure: newBeats });
            }
            return;
          }
        }

        // D — remove last beat
        if (matchesBinding(e, b.removeBeat)) {
          e.preventDefault();
          const cur = beatsPerMeasureRef.current;
          if (cur > 1) {
            const newBeats = cur - 1;
            const newTypes = beatTypesRef.current.slice(0, newBeats);
            setBeatsPerMeasure(newBeats);
            setBeatTypes(newTypes);
            engineRef.current?.setBeatsPerMeasure(newBeats);
            engineRef.current?.setBeatTypes(newTypes);
            if (!inBarMode) persistSettings({ beatsPerMeasure: newBeats });
          }
          return;
        }
      }

      // Shift+S/A/N/M — add subdivision cell (beat mode only, not while playing)
      if (!playing && !barModeRef.current && !noteModeRef.current) {
        const addSubShortcuts: { binding: typeof b.addSubStrong; type: BeatType }[] = [
          { binding: b.addSubStrong, type: "strong" },
          { binding: b.addSubAccent, type: "accent" },
          { binding: b.addSubNormal, type: "normal" },
          { binding: b.addSubMute,   type: "mute" },
        ];
        for (const { binding, type } of addSubShortcuts) {
          if (matchesBinding(e, binding)) {
            e.preventDefault();
            const p = subdivisionPatternRef.current;
            if (p.length < 8) {
              const newP: BeatType[] = [...p, type];
              setSubdivisionPattern(newP);
              persistSettings({ subdivisionPattern: newP });
            }
            return;
          }
        }

        // Shift+D — remove last subdivision cell
        if (matchesBinding(e, b.removeSub)) {
          e.preventDefault();
          const p = subdivisionPatternRef.current;
          if (p.length > 1) {
            const newP = p.slice(0, -1);
            setSubdivisionPattern(newP);
            persistSettings({ subdivisionPattern: newP });
          }
          return;
        }
      }

      // 0 — cycle subdivision cell types (beat mode only)
      if (!barModeRef.current && !noteModeRef.current && matchesBinding(e, b.cycleBeatTypes)) {
        e.preventDefault();
        const subCycleOrder: BeatType[] = ["strong", "accent", "normal", "mute"];
        const prev = subdivisionPatternRef.current;
        const first = prev[0] || "normal";
        const idx = subCycleOrder.indexOf(first as BeatType);
        const next = subCycleOrder[(idx + 1) % subCycleOrder.length];
        const newP = prev.map(() => next) as BeatType[];
        setSubdivisionPattern(newP);
        persistSettings({ subdivisionPattern: newP });
        return;
      }

      // Digit keys — forward to active timer input only
      if (/^Digit[0-9]$/.test(e.code)) {
        const swRef = stopwatchTimerRef.current || stopwatchTimerLandscapeRef.current;
        if (swRef?.isTimerInputActive()) {
          const digit = e.code.slice(5);
          swRef.handleDigit(digit);
          return;
        }
      }

      // L — loop mode toggle (bar mode)
      if (inBarMode && matchesBinding(e, b.loopToggle)) {
        e.preventDefault();
        setBarLoopMode((prev) => (prev === "once" ? "loop" : "once"));
        return;
      }

      // G — block play mode cycle (bar mode)
      if (inBarMode && matchesBinding(e, b.blockPlayModeNext)) {
        e.preventDefault();
        setBlockPlayMode((prev) => {
          const order: ("sequential" | "loop" | "random")[] = ["sequential", "loop", "random"];
          const idx = order.indexOf(prev);
          return order[(idx + 1) % order.length];
        });
        return;
      }
    };

    const handleKeyUp = (e: NormalizedKeyEvent) => {
      if (e.code === heldKeyRef.current) clearRepeat();
    };

    if (Platform.OS === "web") {
      const webKeyDown = (e: KeyboardEvent) => handleKeyDown(e);
      const webKeyUp = (e: KeyboardEvent) => handleKeyUp(e);
      window.addEventListener("keydown", webKeyDown);
      window.addEventListener("keyup", webKeyUp);
      return () => {
        clearRepeat();
        window.removeEventListener("keydown", webKeyDown);
        window.removeEventListener("keyup", webKeyUp);
      };
    } else {
      nativeKbDownRef.current = handleKeyDown;
      nativeKbUpRef.current = handleKeyUp;
      return () => {
        clearRepeat();
        nativeKbDownRef.current = null;
        nativeKbUpRef.current = null;
      };
    }
  }, []);
}
