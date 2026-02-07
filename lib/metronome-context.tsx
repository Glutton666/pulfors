import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import {
  AppSettings,
  TempoPreset,
  DEFAULT_SETTINGS,
  DEFAULT_PRESETS,
  TIME_SIGNATURES,
  BEAT_SUBDIVISIONS,
  loadSettings,
  saveSettings as saveSettingsToStorage,
  loadPresets,
  savePresets as savePresetsToStorage,
} from "@/lib/storage";
import { MetronomeEngine } from "@/lib/metronome-engine";

interface MetronomeContextValue {
  settings: AppSettings;
  presets: TempoPreset[];
  isPlaying: boolean;
  currentBeat: number;
  bpm: number;
  stopwatchMs: number;
  isStopwatchRunning: boolean;
  timerMs: number;
  timerTargetMs: number;
  isTimerRunning: boolean;
  isTimerSet: boolean;
  isLoaded: boolean;

  setBpm: (bpm: number) => void;
  adjustBpm: (delta: number) => void;
  togglePlay: () => void;
  setTimeSignatureIndex: (idx: number) => void;
  setTempoPresetIndex: (idx: number) => void;
  setBeatSubdivision: (sub: number) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  updatePresets: (presets: TempoPreset[]) => void;

  startStopwatch: () => void;
  stopStopwatch: () => void;
  resetStopwatch: () => void;

  setTimerTarget: (ms: number) => void;
  startTimer: () => void;
  stopTimer: () => void;
  resetTimer: () => void;

  engineRef: React.MutableRefObject<MetronomeEngine | null>;
}

const MetronomeContext = createContext<MetronomeContextValue | null>(null);

export function useMetronome() {
  const ctx = useContext(MetronomeContext);
  if (!ctx) throw new Error("useMetronome must be used within MetronomeProvider");
  return ctx;
}

export function MetronomeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [presets, setPresets] = useState<TempoPreset[]>(DEFAULT_PRESETS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [bpm, setBpmState] = useState(DEFAULT_SETTINGS.bpm);
  const [isLoaded, setIsLoaded] = useState(false);

  const [stopwatchMs, setStopwatchMs] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const stopwatchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopwatchStartRef = useRef(0);

  const [timerMs, setTimerMs] = useState(0);
  const [timerTargetMs, setTimerTargetMs] = useState(60000);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isTimerSet, setIsTimerSet] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerStartRef = useRef(0);
  const timerWaitingForLastBeat = useRef(false);

  const engineRef = useRef<MetronomeEngine | null>(null);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    const engine = new MetronomeEngine();
    engineRef.current = engine;

    engine.setOnBeat((beat, isAccent) => {
      setCurrentBeat(beat);

      if (timerWaitingForLastBeat.current && beat === 0) {
        timerWaitingForLastBeat.current = false;
        engine.stop();
        isPlayingRef.current = false;
        setIsPlaying(false);
        setCurrentBeat(-1);
        setIsTimerRunning(false);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    });

    Promise.all([loadSettings(), loadPresets()]).then(([s, p]) => {
      setSettings(s);
      setPresets(p);
      setBpmState(s.bpm);
      engine.setBpm(s.bpm);
      engine.setBeatsPerMeasure(TIME_SIGNATURES[s.timeSignatureIndex]?.beats || 4);
      engine.setVolume(s.volume);
      setIsLoaded(true);
    });

    return () => {
      engine.cleanup();
    };
  }, []);

  const setBpm = useCallback((newBpm: number) => {
    const clamped = Math.max(20, Math.min(300, newBpm));
    setBpmState(clamped);
    engineRef.current?.setBpm(clamped);
    saveSettingsToStorage({ bpm: clamped });
  }, []);

  const adjustBpm = useCallback((delta: number) => {
    setBpmState(prev => {
      const newVal = Math.max(20, Math.min(300, prev + delta));
      engineRef.current?.setBpm(newVal);
      saveSettingsToStorage({ bpm: newVal });
      return newVal;
    });
  }, []);

  const togglePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (isPlayingRef.current) {
      engine.stop();
      isPlayingRef.current = false;
      setIsPlaying(false);
      setCurrentBeat(-1);
    } else {
      engine.start();
      isPlayingRef.current = true;
      setIsPlaying(true);
    }
  }, []);

  const setTimeSignatureIndex = useCallback((idx: number) => {
    const ts = TIME_SIGNATURES[idx];
    if (!ts) return;
    setSettings(prev => ({ ...prev, timeSignatureIndex: idx, beatsPerMeasure: ts.beats }));
    engineRef.current?.setBeatsPerMeasure(ts.beats);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    saveSettingsToStorage({ timeSignatureIndex: idx, beatsPerMeasure: ts.beats });
  }, []);

  const setTempoPresetIndex = useCallback((idx: number) => {
    const preset = presets[idx];
    if (!preset) return;
    setSettings(prev => ({ ...prev, tempoPresetIndex: idx }));
    setBpm(preset.bpm);
    if (Platform.OS !== "web") Haptics.selectionAsync();
    saveSettingsToStorage({ tempoPresetIndex: idx });
  }, [presets, setBpm]);

  const setBeatSubdivision = useCallback((sub: number) => {
    setSettings(prev => ({ ...prev, beatSubdivision: sub }));
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    saveSettingsToStorage({ beatSubdivision: sub });
  }, []);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...partial };
      if (partial.volume !== undefined) {
        engineRef.current?.setVolume(partial.volume);
      }
      saveSettingsToStorage(partial);
      return updated;
    });
  }, []);

  const updatePresets = useCallback((p: TempoPreset[]) => {
    setPresets(p);
    savePresetsToStorage(p);
  }, []);

  const startStopwatch = useCallback(() => {
    if (isStopwatchRunning) return;
    setIsStopwatchRunning(true);
    stopwatchStartRef.current = Date.now() - stopwatchMs;
    stopwatchRef.current = setInterval(() => {
      setStopwatchMs(Date.now() - stopwatchStartRef.current);
    }, 50);
  }, [isStopwatchRunning, stopwatchMs]);

  const stopStopwatch = useCallback(() => {
    setIsStopwatchRunning(false);
    if (stopwatchRef.current) clearInterval(stopwatchRef.current);
  }, []);

  const resetStopwatch = useCallback(() => {
    stopStopwatch();
    setStopwatchMs(0);
  }, [stopStopwatch]);

  const setTimerTarget = useCallback((ms: number) => {
    setTimerTargetMs(ms);
    setTimerMs(0);
    setIsTimerSet(true);
  }, []);

  const startTimer = useCallback(() => {
    if (isTimerRunning) return;
    setIsTimerRunning(true);
    timerStartRef.current = Date.now() - timerMs;
    timerWaitingForLastBeat.current = false;
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - timerStartRef.current;
      setTimerMs(elapsed);
      if (elapsed >= timerTargetMs && !timerWaitingForLastBeat.current) {
        timerWaitingForLastBeat.current = true;
      }
    }, 50);

    if (!isPlayingRef.current) {
      const engine = engineRef.current;
      if (engine) {
        engine.start();
        isPlayingRef.current = true;
        setIsPlaying(true);
      }
    }
  }, [isTimerRunning, timerMs, timerTargetMs]);

  const stopTimer = useCallback(() => {
    setIsTimerRunning(false);
    timerWaitingForLastBeat.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const resetTimer = useCallback(() => {
    stopTimer();
    setTimerMs(0);
    setIsTimerSet(false);
  }, [stopTimer]);

  const value = useMemo(() => ({
    settings, presets, isPlaying, currentBeat, bpm, isLoaded,
    stopwatchMs, isStopwatchRunning,
    timerMs, timerTargetMs, isTimerRunning, isTimerSet,
    setBpm, adjustBpm, togglePlay,
    setTimeSignatureIndex, setTempoPresetIndex, setBeatSubdivision,
    updateSettings, updatePresets,
    startStopwatch, stopStopwatch, resetStopwatch,
    setTimerTarget, startTimer, stopTimer, resetTimer,
    engineRef,
  }), [
    settings, presets, isPlaying, currentBeat, bpm, isLoaded,
    stopwatchMs, isStopwatchRunning,
    timerMs, timerTargetMs, isTimerRunning, isTimerSet,
    setBpm, adjustBpm, togglePlay,
    setTimeSignatureIndex, setTempoPresetIndex, setBeatSubdivision,
    updateSettings, updatePresets,
    startStopwatch, stopStopwatch, resetStopwatch,
    setTimerTarget, startTimer, stopTimer, resetTimer,
    engineRef,
  ]);

  return (
    <MetronomeContext.Provider value={value}>
      {children}
    </MetronomeContext.Provider>
  );
}
