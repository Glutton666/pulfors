import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  Modal,
  Alert,
} from "react-native";
import * as Linking from "expo-linking";
import {
  setupNotificationControls,
  showPlayingNotification,
  showPausedNotification,
  updateNotificationBpm,
  dismissNotification,
  addNotificationActionListener,
} from "@/lib/notification-controls";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
  useSharedValue,
} from "react-native-reanimated";
import { useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import type { ThemeColor } from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { moderateScale } from "@/lib/scale";
import {
  MetronomeEngine,
  soundSets,
} from "@/lib/metronome-engine";
import type { BeatType } from "@/lib/metronome-engine";
import { loadSettings, saveSettings } from "@/lib/storage";
import type { FlashMode, HapticMode, SoundSet } from "@/lib/storage";
import {
  BeatIndicator,
  DIAL_SIZE,
  DOT_RADIUS_FROM_CENTER,
} from "@/components/BeatIndicator";
import type { BarRepeat, LoopBlock } from "@/components/BeatIndicator";
import { BpmSlider } from "@/components/BpmSlider";
import { SubdivisionBar, DragGhost } from "@/components/SubdivisionBar";
import { StopwatchTimer } from "@/components/StopwatchTimer";
import { SettingsModal } from "@/components/SettingsModal";
import { TunerModal } from "@/components/TunerModal";
import { SignalGeneratorModal } from "@/components/SignalGeneratorModal";
import { PracticeBookModal } from "@/components/PracticeBookModal";
import { WorkUpOverviewModal } from "@/components/WorkUpOverviewModal";
import type { PracticeEntry } from "@/lib/storage";
import { loadLoggingEnabled, saveLoggingEnabled, addActivityLog, loadActivityLogs, loadGoals, saveGoals } from "@/lib/activity-log";
import { loadNoteSamples, saveNoteSamples, setNoteSample, removeNoteSample, hasNoteSample, loadNoteSampleNames, setNoteSampleName, removeNoteSampleName, loadNoteSampleSources, setNoteSampleSource, removeNoteSampleSource } from "@/lib/note-samples";
import type { NoteSampleMap, NoteSampleNameMap, NoteSampleSourceMap, SampleSource } from "@/lib/note-samples";
import { NoteRecorderModal } from "@/components/NoteRecorderModal";
import { AudioModule, createAudioPlayer } from "expo-audio";
import type { AudioPlayer as ExpoAudioPlayer } from "expo-audio";
import {
  decodeSampleFile,
  loadAssetPCM,
  parseTrimInfo,
  renderMeasure,
  saveRenderedWav,
} from "@/lib/audio-renderer";
import type { ClickPCMs, SamplePCMEntry, TickInfo } from "@/lib/audio-renderer";
import type { ActivityLog, Goal, PracticeSessionData, PracticeRoomVisitData } from "@/lib/activity-log";
import {
  loadPracticeRooms,
  getCurrentLocation,
  requestLocationPermission,
  findNearbyRoom,
  type PracticeRoom,
} from "@/lib/practice-room";

function getTempoLabel(bpm: number): string {
  if (bpm < 40) return "Grave";
  if (bpm < 60) return "Largo";
  if (bpm < 80) return "Adagio";
  if (bpm < 100) return "Andante";
  if (bpm < 120) return "Moderato";
  if (bpm < 160) return "Allegro";
  if (bpm < 200) return "Vivace";
  if (bpm < 300) return "Presto";
  return "Prestissimo";
}

function defaultBeatTypes(beats: number): BeatType[] {
  return Array.from({ length: beats }, (_, i) =>
    i === 0 ? "accent" : "normal"
  );
}

export default function MetronomeScreen() {
  const insets = useSafeAreaInsets();
  const { setThemeColor, colors: C } = useTheme();

  const [bpm, setBpm] = useState(120);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const [beatTypes, setBeatTypes] = useState<BeatType[]>(defaultBeatTypes(4));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [activeSubNote, setActiveSubNote] = useState(-1);
  const activeSubNoteRef = useRef(-1);
  const [subdivisionPattern, setSubdivisionPattern] = useState<BeatType[]>([
    "accent",
  ]);
  const [beatSubdivisions, setBeatSubdivisions] = useState<
    Record<string, BeatType[]>
  >({});
  const [barMode, setBarMode] = useState(false);
  const [barStartBeat, setBarStartBeat] = useState<number | null>(null);
  const [barLoopMode, setBarLoopMode] = useState<"loop" | "once">("loop");
  const [barRepeats, setBarRepeats] = useState<Record<number, BarRepeat>>({});
  const [loopBlocks, setLoopBlocks] = useState<LoopBlock[]>([]);
  const barAreaRef = useRef<View>(null);
  const barAreaLayoutRef = useRef({ y: 0, height: 0 });
  const barScrollOffsetRef = useRef(0);

  const dialConfigRef = useRef({
    beatsPerMeasure: 4,
    beatTypes: defaultBeatTypes(4),
    beatSubdivisions: {} as Record<string, BeatType[]>,
  });
  const barConfigRef = useRef({
    beatsPerMeasure: 4,
    beatTypes: defaultBeatTypes(4),
    beatSubdivisions: {} as Record<string, BeatType[]>,
    barRepeats: {} as Record<number, BarRepeat>,
    loopBlocks: [] as LoopBlock[],
    barClockMode: "stopwatch" as "stopwatch" | "timer",
    barTimerDuration: 180,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dropTargetBeat, setDropTargetBeat] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [sampleVolume, setSampleVolume] = useState(0.8);
  const sampleVolumeRef = useRef(0.8);
  const [showSettings, setShowSettings] = useState(false);
  const [backgroundPlay, setBackgroundPlay] = useState(false);
  const [soundSet, setSoundSet] = useState<SoundSet>("classic");
  const [flashMode, setFlashMode] = useState<FlashMode>("accent");
  const [hapticMode, setHapticMode] = useState<HapticMode>("all");
  const [audioOffsetMs, setAudioOffsetMs] = useState(0);
  const [timerStopMode, setTimerStopMode] = useState<"immediate" | "end-of-cycle">("end-of-cycle");
  const [username, setUsername] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showTuner, setShowTuner] = useState(false);
  const [showSignalGen, setShowSignalGen] = useState(false);
  const [showPracticeBook, setShowPracticeBook] = useState(false);
  const [showWorkUp, setShowWorkUp] = useState(false);
  const [loggingEnabled, setLoggingEnabled] = useState(false);
  const practiceStartRef = useRef<number | null>(null);
  const featureStartRef = useRef<{ name: string; start: number } | null>(null);
  const loadedPracticeNoteRef = useRef<{ id: string; label: string } | null>(null);
  const roomTrackRef = useRef<{ roomId: string; roomName: string; start: number } | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [roomTrackingActive, setRoomTrackingActive] = useState(false);
  const [trackingRoomName, setTrackingRoomName] = useState<string | null>(null);
  const [completedGoalPopups, setCompletedGoalPopups] = useState<Goal[]>([]);
  const dismissedGoalIdsRef = useRef<Set<string>>(new Set());

  const [noteSamples, setNoteSamples] = useState<NoteSampleMap>({});
  const noteSamplesRef = useRef<NoteSampleMap>({});
  const [noteSampleNames, setNoteSampleNames] = useState<NoteSampleNameMap>({});
  const noteSampleNamesRef = useRef<NoteSampleNameMap>({});
  const [noteSampleSources, setNoteSampleSources] = useState<NoteSampleSourceMap>({});
  const noteSampleSourcesRef = useRef<NoteSampleSourceMap>({});
  const noteSampleSoundsRef = useRef<Record<string, ExpoAudioPlayer>>({});
  const samplePlayStateRef = useRef<Record<string, { playing: boolean; endTimer: ReturnType<typeof setTimeout> | null }>>({});
  const [recorderTarget, setRecorderTarget] = useState<{ beat: number; sub: number } | null>(null);

  const renderedPlayerRef = useRef<ExpoAudioPlayer | null>(null);
  const pendingRenderedPlayerRef = useRef<ExpoAudioPlayer | null>(null);
  const clickPCMCacheRef = useRef<Record<string, ClickPCMs>>({});
  const samplePCMCacheRef = useRef<Map<string, SamplePCMEntry>>(new Map());
  const renderedUrlRef = useRef<string | null>(null);

  const engineRef = useRef<MetronomeEngine | null>(null);
  const tapTimesRef = useRef<number[]>([]);
  const dialRef = useRef<View>(null);
  const dialCenterRef = useRef({ x: 0, y: 0 });

  const classicHighA = useAudioPlayer(soundSets.classic.high);
  const classicHighB = useAudioPlayer(soundSets.classic.high);
  const classicLowA = useAudioPlayer(soundSets.classic.low);
  const classicLowB = useAudioPlayer(soundSets.classic.low);
  const classicStrongA = useAudioPlayer(soundSets.classic.strong);
  const classicStrongB = useAudioPlayer(soundSets.classic.strong);

  const woodblockHighA = useAudioPlayer(soundSets.woodblock.high);
  const woodblockHighB = useAudioPlayer(soundSets.woodblock.high);
  const woodblockLowA = useAudioPlayer(soundSets.woodblock.low);
  const woodblockLowB = useAudioPlayer(soundSets.woodblock.low);
  const woodblockStrongA = useAudioPlayer(soundSets.woodblock.strong);
  const woodblockStrongB = useAudioPlayer(soundSets.woodblock.strong);

  const digitalHighA = useAudioPlayer(soundSets.digital.high);
  const digitalHighB = useAudioPlayer(soundSets.digital.high);
  const digitalLowA = useAudioPlayer(soundSets.digital.low);
  const digitalLowB = useAudioPlayer(soundSets.digital.low);
  const digitalStrongA = useAudioPlayer(soundSets.digital.strong);
  const digitalStrongB = useAudioPlayer(soundSets.digital.strong);

  const rimshotHighA = useAudioPlayer(soundSets.rimshot.high);
  const rimshotHighB = useAudioPlayer(soundSets.rimshot.high);
  const rimshotLowA = useAudioPlayer(soundSets.rimshot.low);
  const rimshotLowB = useAudioPlayer(soundSets.rimshot.low);
  const rimshotStrongA = useAudioPlayer(soundSets.rimshot.strong);
  const rimshotStrongB = useAudioPlayer(soundSets.rimshot.strong);

  const allPlayers = useMemo(() => ({
    classic: { highA: classicHighA, highB: classicHighB, lowA: classicLowA, lowB: classicLowB, strongA: classicStrongA, strongB: classicStrongB },
    woodblock: { highA: woodblockHighA, highB: woodblockHighB, lowA: woodblockLowA, lowB: woodblockLowB, strongA: woodblockStrongA, strongB: woodblockStrongB },
    digital: { highA: digitalHighA, highB: digitalHighB, lowA: digitalLowA, lowB: digitalLowB, strongA: digitalStrongA, strongB: digitalStrongB },
    rimshot: { highA: rimshotHighA, highB: rimshotHighB, lowA: rimshotLowA, lowB: rimshotLowB, strongA: rimshotStrongA, strongB: rimshotStrongB },
  }), [classicHighA, classicHighB, classicLowA, classicLowB, classicStrongA, classicStrongB, woodblockHighA, woodblockHighB, woodblockLowA, woodblockLowB, woodblockStrongA, woodblockStrongB, digitalHighA, digitalHighB, digitalLowA, digitalLowB, digitalStrongA, digitalStrongB, rimshotHighA, rimshotHighB, rimshotLowA, rimshotLowB, rimshotStrongA, rimshotStrongB]);

  const highToggle = useRef(false);
  const lowToggle = useRef(false);
  const strongToggle = useRef(false);
  const soundSetRef = useRef(soundSet);
  useEffect(() => { soundSetRef.current = soundSet; }, [soundSet]);
  const allPlayersRef = useRef(allPlayers);
  useEffect(() => { allPlayersRef.current = allPlayers; }, [allPlayers]);

  const flashOpacity = useSharedValue(0);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  useEffect(() => {
    const engine = new MetronomeEngine();
    engineRef.current = engine;

    const restartPlayer = (active: any) => {
      try {
        active.seekTo(0);
        active.play();
      } catch (e) {}
    };

    engine.setAudioCallbacks(
      () => {
        try {
          const players = allPlayersRef.current[soundSetRef.current] || allPlayersRef.current.classic;
          const active = highToggle.current ? players.highB : players.highA;
          highToggle.current = !highToggle.current;
          restartPlayer(active);
        } catch (e) {}
      },
      () => {
        try {
          const players = allPlayersRef.current[soundSetRef.current] || allPlayersRef.current.classic;
          const active = lowToggle.current ? players.lowB : players.lowA;
          lowToggle.current = !lowToggle.current;
          restartPlayer(active);
        } catch (e) {}
      },
      () => {
        try {
          const players = allPlayersRef.current[soundSetRef.current] || allPlayersRef.current.classic;
          const active = strongToggle.current ? players.strongB : players.strongA;
          strongToggle.current = !strongToggle.current;
          restartPlayer(active);
        } catch (e) {}
      }
    );

    const preloadSounds = async (samples: NoteSampleMap) => {
      for (const s of Object.values(noteSampleSoundsRef.current)) {
        try { s.release(); } catch {}
      }
      noteSampleSoundsRef.current = {};

      const invalidKeys: string[] = [];
      for (const [key, uri] of Object.entries(samples)) {
        try {
          const rawUri = uri.split("#")[0];
          const isFileUri = rawUri.startsWith("file://");
          const player = createAudioPlayer(rawUri, { downloadFirst: isFileUri });
          player.volume = sampleVolumeRef.current * 5.0;
          noteSampleSoundsRef.current[key] = player;
        } catch (e) {
          console.warn("[SamplePreload] Failed to preload:", key, e);
          invalidKeys.push(key);
        }
      }

      if (invalidKeys.length > 0) {
        let cleaned = { ...samples };
        for (const k of invalidKeys) {
          delete cleaned[k];
        }
        setNoteSamples(cleaned);
        noteSamplesRef.current = cleaned;
        saveNoteSamples(cleaned);
      }
    };

    loadSettings().then((settings) => {
      setBpm(settings.bpm);
      setBeatsPerMeasure(settings.beatsPerMeasure);
      engine.setBpm(settings.bpm);
      engine.setBeatsPerMeasure(settings.beatsPerMeasure);

      if (settings.subdivisionPattern && settings.subdivisionPattern.length > 0) {
        setSubdivisionPattern(settings.subdivisionPattern);
      }
      if (settings.beatSubdivisions) {
        setBeatSubdivisions(settings.beatSubdivisions);
        engine.setAllBeatSubdivisions(settings.beatSubdivisions);
      }
      if (settings.volume !== undefined) {
        setVolume(settings.volume);
      }
      if (settings.sampleVolume !== undefined) {
        setSampleVolume(settings.sampleVolume);
        sampleVolumeRef.current = settings.sampleVolume;
      }
      if (settings.backgroundPlay !== undefined) {
        setBackgroundPlay(settings.backgroundPlay);
      }
      if (settings.soundSet) {
        setSoundSet(settings.soundSet);
      }
      if (settings.flashMode) {
        setFlashMode(settings.flashMode);
        flashModeRef.current = settings.flashMode;
      }
      if (settings.hapticMode) {
        setHapticMode(settings.hapticMode);
        engine.setHapticMode(settings.hapticMode);
      }
      if (settings.audioOffsetMs !== undefined) {
        setAudioOffsetMs(settings.audioOffsetMs);
        engine.setAudioOffsetMs(settings.audioOffsetMs);
      }
      if (settings.themeColor) {
        setThemeColor(settings.themeColor);
      }
      if (settings.timerStopMode) {
        setTimerStopMode(settings.timerStopMode);
      }
      if (settings.username) {
        setUsername(settings.username);
      }

      setIsLoaded(true);

      const set = settings.soundSet || "classic";
      const src = soundSets[set] || soundSets.classic;
      Promise.all([
        loadAssetPCM(src.strong),
        loadAssetPCM(src.high),
        loadAssetPCM(src.low),
      ]).then(([strong, high, low]) => {
        clickPCMCacheRef.current[set] = { strong, high, low };
      }).catch(() => {});
    });

    loadNoteSamples().then((samples) => {
      setNoteSamples(samples);
      noteSamplesRef.current = samples;
      preloadSounds(samples);
    });

    loadNoteSampleNames().then((names) => {
      setNoteSampleNames(names);
      noteSampleNamesRef.current = names;
    });

    loadNoteSampleSources().then((sources) => {
      setNoteSampleSources(sources);
      noteSampleSourcesRef.current = sources;
    });

    const sampleTimingCacheRef = { current: new Map<string, { startMs: number; durationMs: number }>() };

    const parseSampleTiming = (key: string): { startMs: number; durationMs: number } => {
      const cached = sampleTimingCacheRef.current.get(key);
      if (cached) return cached;
      const sampleUri = noteSamplesRef.current[key] || "";
      const hashParts = sampleUri.split("#t=")[1];
      let startMs = 0;
      let endMs = 0;
      if (hashParts) {
        const parts = hashParts.split(",").map(Number);
        if (!isNaN(parts[0])) startMs = parts[0];
        if (parts.length > 1 && !isNaN(parts[1])) endMs = parts[1];
      }
      const durationMs = endMs > startMs ? endMs - startMs : 0;
      const result = { startMs, durationMs };
      sampleTimingCacheRef.current.set(key, result);
      return result;
    };

    const playSampleAsync = (key: string, player: any) => {
      if (samplePlayStateRef.current[key]?.endTimer) {
        clearTimeout(samplePlayStateRef.current[key].endTimer!);
      }
      try { player.pause(); } catch {}

      const { startMs, durationMs } = parseSampleTiming(key);
      samplePlayStateRef.current[key] = { playing: true, endTimer: null };

      player.seekTo(startMs / 1000).then(() => {
        player.play();
        const effectiveDur = durationMs > 0
          ? durationMs
          : player.duration > 0
            ? (player.duration - startMs / 1000) * 1000
            : 0;
        if (effectiveDur > 0) {
          const timer = setTimeout(() => {
            try { player.pause(); } catch {}
            if (samplePlayStateRef.current[key]) {
              samplePlayStateRef.current[key].playing = false;
              samplePlayStateRef.current[key].endTimer = null;
            }
          }, effectiveDur);
          if (samplePlayStateRef.current[key]) {
            samplePlayStateRef.current[key].endTimer = timer;
          }
        }
      }).catch(() => {
        if (samplePlayStateRef.current[key]) {
          samplePlayStateRef.current[key].playing = false;
        }
      });
    };

    engine.setCustomSampleCallback((beat: number, subBeat: number) => {
      if (!barModeRef.current) return false;
      const key = `${beat}-${subBeat}`;
      const player = noteSampleSoundsRef.current[key];
      if (player) {
        setTimeout(() => playSampleAsync(key, player), 0);
        return true;
      }
      return false;
    });

    loadLoggingEnabled().then((val) => setLoggingEnabled(val));
    setupNotificationControls();

    return () => {
      engine.cleanup();
      if (renderedPlayerRef.current) {
        try { renderedPlayerRef.current.release(); } catch {}
        renderedPlayerRef.current = null;
      }
      dismissNotification();
    };
  }, []);

  const preloadNoteSampleSounds = useCallback(async (samples: NoteSampleMap) => {
    for (const s of Object.values(noteSampleSoundsRef.current)) {
      try { s.release(); } catch {}
    }
    noteSampleSoundsRef.current = {};

    const invalidKeys: string[] = [];
    for (const [key, uri] of Object.entries(samples)) {
      try {
        const rawUri = uri.split("#")[0];
        const isFileUri = rawUri.startsWith("file://");
        const player = createAudioPlayer(rawUri, { downloadFirst: isFileUri });
        player.volume = sampleVolumeRef.current * 5.0;
        noteSampleSoundsRef.current[key] = player;
      } catch (e) {
        console.warn("[SamplePreload] Failed:", key, e);
        invalidKeys.push(key);
      }
    }

    if (invalidKeys.length > 0) {
      let cleaned = { ...samples };
      for (const k of invalidKeys) {
        delete cleaned[k];
      }
      setNoteSamples(cleaned);
      noteSamplesRef.current = cleaned;
      saveNoteSamples(cleaned);
    }
  }, []);

  const clearSamplePlayStates = useCallback(() => {
    for (const [key, state] of Object.entries(samplePlayStateRef.current)) {
      if (state.endTimer) clearTimeout(state.endTimer);
    }
    samplePlayStateRef.current = {};
    for (const player of Object.values(noteSampleSoundsRef.current)) {
      try { player.pause(); } catch {}
    }
  }, []);

  const getClickPCMs = useCallback(async (set: SoundSet): Promise<ClickPCMs> => {
    if (clickPCMCacheRef.current[set]) return clickPCMCacheRef.current[set];
    const src = soundSets[set] || soundSets.classic;
    const [strong, high, low] = await Promise.all([
      loadAssetPCM(src.strong),
      loadAssetPCM(src.high),
      loadAssetPCM(src.low),
    ]);
    const result: ClickPCMs = { strong, high, low };
    clickPCMCacheRef.current[set] = result;
    return result;
  }, []);

  const getSamplePCMs = useCallback(async (samples: NoteSampleMap): Promise<Map<string, SamplePCMEntry>> => {
    const map = new Map<string, SamplePCMEntry>();
    const entries = Object.entries(samples);
    if (entries.length === 0) return map;

    await Promise.all(entries.map(async ([key, uri]) => {
      const cached = samplePCMCacheRef.current.get(key);
      if (cached) {
        map.set(key, cached);
        return;
      }
      try {
        const pcm = await decodeSampleFile(uri);
        if (pcm) {
          const { trimStartMs, trimDurationMs } = parseTrimInfo(uri);
          const entry: SamplePCMEntry = { pcm, trimStartMs, trimDurationMs };
          map.set(key, entry);
          samplePCMCacheRef.current.set(key, entry);
        }
      } catch (e) {
        console.warn("[PreRender] Failed to decode sample:", key, e);
      }
    }));
    return map;
  }, []);

  const buildRenderedPlayer = useCallback(async (): Promise<ExpoAudioPlayer | null> => {
    const engine = engineRef.current;
    if (!engine) return null;

    try {
      const scheduleInfo = engine.getScheduleInfo();
      const [clickPCMs] = await Promise.all([
        getClickPCMs(soundSetRef.current),
      ]);
      const samplePCMs = new Map<string, SamplePCMEntry>();

      const pcm = renderMeasure({
        schedule: scheduleInfo.ticks as TickInfo[],
        measureDurationMs: scheduleInfo.durationMs,
        clickPCMs,
        samplePCMs,
        clickVolume: 1.0,
        sampleVolume: samplePCMs.size > 0 ? sampleVolumeRef.current * 5.0 : 0,
      });

      const wavUri = await saveRenderedWav(pcm);

      if (Platform.OS === "web" && renderedUrlRef.current) {
        try { URL.revokeObjectURL(renderedUrlRef.current); } catch {}
      }
      renderedUrlRef.current = wavUri;

      const player = createAudioPlayer(wavUri);
      player.loop = true;
      player.volume = 1.0;
      return player;
    } catch (e) {
      console.warn("[PreRender] Failed, falling back to per-tick audio:", e);
      return null;
    }
  }, [getClickPCMs]);

  const stopRenderedAudio = useCallback(() => {
    if (renderedPlayerRef.current) {
      try {
        renderedPlayerRef.current.pause();
        renderedPlayerRef.current.release();
      } catch {}
      renderedPlayerRef.current = null;
    }
    if (Platform.OS === "web" && renderedUrlRef.current) {
      try { URL.revokeObjectURL(renderedUrlRef.current); } catch {}
      renderedUrlRef.current = null;
    }
    const engine = engineRef.current;
    if (engine) engine.setPreRenderedAudio(false);
  }, []);

  const reRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReRender = useCallback(() => {
    if (reRenderTimerRef.current) clearTimeout(reRenderTimerRef.current);
    reRenderTimerRef.current = setTimeout(() => {
      if (engineRef.current?.getIsRunning()) {
        stopRenderedAudio();
      }
    }, 300);
  }, [stopRenderedAudio]);

  const invalidateSamplePCMCache = useCallback((key?: string) => {
    if (key) {
      samplePCMCacheRef.current.delete(key);
    } else {
      samplePCMCacheRef.current.clear();
    }
  }, []);

  const handleNoteRecordRequest = useCallback((beatIndex: number, subIndex: number) => {
    setRecorderTarget({ beat: beatIndex, sub: subIndex });
  }, []);

  const handleNoteRecordSave = useCallback(async (uri: string, name: string, source: SampleSource) => {
    if (!recorderTarget) return;
    const key = `${recorderTarget.beat}-${recorderTarget.sub}`;
    invalidateSamplePCMCache(key);
    const updated = await setNoteSample(recorderTarget.beat, recorderTarget.sub, uri, noteSamplesRef.current);
    setNoteSamples(updated);
    noteSamplesRef.current = updated;
    const updatedNames = await setNoteSampleName(recorderTarget.beat, recorderTarget.sub, name, noteSampleNamesRef.current);
    setNoteSampleNames(updatedNames);
    noteSampleNamesRef.current = updatedNames;
    const updatedSources = await setNoteSampleSource(recorderTarget.beat, recorderTarget.sub, source, noteSampleSourcesRef.current);
    setNoteSampleSources(updatedSources);
    noteSampleSourcesRef.current = updatedSources;
    await preloadNoteSampleSounds(updated);
    scheduleReRender();
    setRecorderTarget(null);
  }, [recorderTarget, preloadNoteSampleSounds, invalidateSamplePCMCache, scheduleReRender]);

  const handleNoteRecordDelete = useCallback(async () => {
    if (!recorderTarget) return;
    const key = `${recorderTarget.beat}-${recorderTarget.sub}`;
    invalidateSamplePCMCache(key);
    const updated = await removeNoteSample(recorderTarget.beat, recorderTarget.sub, noteSamplesRef.current);
    setNoteSamples(updated);
    noteSamplesRef.current = updated;
    const updatedNames = await removeNoteSampleName(recorderTarget.beat, recorderTarget.sub, noteSampleNamesRef.current);
    setNoteSampleNames(updatedNames);
    noteSampleNamesRef.current = updatedNames;
    const updatedSources = await removeNoteSampleSource(recorderTarget.beat, recorderTarget.sub, noteSampleSourcesRef.current);
    setNoteSampleSources(updatedSources);
    noteSampleSourcesRef.current = updatedSources;
    if (noteSampleSoundsRef.current[key]) {
      try { noteSampleSoundsRef.current[key].release(); } catch {}
      delete noteSampleSoundsRef.current[key];
    }
    scheduleReRender();
    setRecorderTarget(null);
  }, [recorderTarget, invalidateSamplePCMCache, scheduleReRender]);

  const checkCompletedGoals = useCallback(async () => {
    try {
      const [allGoals, allLogs] = await Promise.all([loadGoals(), loadActivityLogs()]);
      if (allGoals.length === 0) return;

      const now = new Date();
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      const dayStartMs = dayStart.getTime();

      const todayLogs = allLogs.filter((l) => l.timestamp >= dayStartMs);
      const todaySessions = todayLogs.filter((l) => l.type === "practice_session");
      const todayTotalTime = todaySessions.reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0) / 60;
      const todayBeatTime = todaySessions.filter((l) => (l.data as PracticeSessionData).mode === "dial").reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0) / 60;
      const todayBarTime = todaySessions.filter((l) => (l.data as PracticeSessionData).mode === "bar").reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0) / 60;
      const todayRoomTime = todayLogs.filter((l) => l.type === "practice_room_visit").reduce((s, l) => s + ((l.data as PracticeRoomVisitData).duration || 0), 0) / 60;

      const newlyCompleted = allGoals.filter((g) => {
        if (dismissedGoalIdsRef.current.has(g.id)) return false;
        let progress = 0;
        switch (g.type) {
          case "total_play_time": progress = todayTotalTime; break;
          case "beat_mode_time": progress = todayBeatTime; break;
          case "bar_mode_time": progress = todayBarTime; break;
          case "room_time": progress = todayRoomTime; break;
          case "session_goal": {
            progress = todaySessions
              .filter((l) => {
                const d = l.data as PracticeSessionData;
                return d.mode === "bar" && d.practiceNoteId === g.practiceNoteId;
              })
              .reduce((s, l) => s + ((l.data as PracticeSessionData).duration || 0), 0) / 60;
            break;
          }
        }
        return progress >= g.target;
      });

      if (newlyCompleted.length > 0) {
        setCompletedGoalPopups((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const fresh = newlyCompleted.filter((g) => !existingIds.has(g.id));
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
      }
    } catch (e) {
      console.warn("Failed to check goals:", e);
    }
  }, []);

  const dismissGoalPopup = useCallback(async (id: string) => {
    dismissedGoalIdsRef.current.add(id);
    setCompletedGoalPopups((prev) => prev.filter((g) => g.id !== id));
    const allGoals = await loadGoals();
    const updated = allGoals.filter((g) => g.id !== id);
    await saveGoals(updated);
  }, []);

  const startRoomTracking = useCallback(async (room: { id: string; name: string }) => {
    const granted = await requestLocationPermission();
    if (!granted) return;
    roomTrackRef.current = { roomId: room.id, roomName: room.name, start: Date.now() };
    setRoomTrackingActive(true);
    setTrackingRoomName(room.name);

    if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    locationIntervalRef.current = setInterval(async () => {
      try {
        const loc = await getCurrentLocation();
        if (!loc || !roomTrackRef.current) return;
        const rooms = await loadPracticeRooms();
        const trackedRoom = rooms.find(r => r.id === roomTrackRef.current!.roomId);
        if (!trackedRoom) return;
        const dist = findNearbyRoom(loc.coords.latitude, loc.coords.longitude, [trackedRoom], 20);
        if (!dist) {
          const dur = Math.round((Date.now() - roomTrackRef.current.start) / 1000);
          if (dur >= 10) {
            addActivityLog({
              type: "practice_room_visit",
              data: { roomId: roomTrackRef.current.roomId, roomName: roomTrackRef.current.roomName, duration: dur },
            }).then(() => checkCompletedGoals());
          }
          roomTrackRef.current = null;
          setRoomTrackingActive(false);
          setTrackingRoomName(null);
          if (locationIntervalRef.current) {
            clearInterval(locationIntervalRef.current);
            locationIntervalRef.current = null;
          }
        }
      } catch (e) {}
    }, 15000);
  }, []);

  const stopRoomTracking = useCallback(() => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
    if (roomTrackRef.current) {
      const dur = Math.round((Date.now() - roomTrackRef.current.start) / 1000);
      if (dur >= 10) {
        addActivityLog({
          type: "practice_room_visit",
          data: { roomId: roomTrackRef.current.roomId, roomName: roomTrackRef.current.roomName, duration: dur },
        }).then(() => checkCompletedGoals());
      }
      roomTrackRef.current = null;
    }
    setRoomTrackingActive(false);
    setTrackingRoomName(null);
  }, [checkCompletedGoals]);

  useEffect(() => {
    return () => {
      stopRoomTracking();
    };
  }, []);

  const flashModeRef = useRef(flashMode);
  useEffect(() => { flashModeRef.current = flashMode; }, [flashMode]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    let beatRafPending = false;
    let pendingBeat = -1;
    let pendingAccent = false;
    engine.setOnBeat((beat: number, isAccent: boolean) => {
      pendingBeat = beat;
      pendingAccent = isAccent;
      if (!beatRafPending) {
        beatRafPending = true;
        requestAnimationFrame(() => {
          beatRafPending = false;
          setCurrentBeat(pendingBeat);
          const fm = flashModeRef.current;
          const shouldFlash = fm === "all" || (fm === "accent" && pendingAccent);
          if (shouldFlash) {
            flashOpacity.value = withSequence(
              withTiming(0.12, { duration: 50 }),
              withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) })
            );
          }
        });
      }
    });

    let subBeatRafPending = false;
    engine.setOnSubBeat((_beat: number, subBeat: number) => {
      activeSubNoteRef.current = subBeat;
      if (!subBeatRafPending) {
        subBeatRafPending = true;
        requestAnimationFrame(() => {
          subBeatRafPending = false;
          setActiveSubNote(activeSubNoteRef.current);
        });
      }
    });
  }, [flashOpacity]);

  useEffect(() => {
    try {
      const MAX_VOLUME = 5.0;
      Object.values(allPlayers).forEach((set) => {
        const v = volume * MAX_VOLUME;
        set.highA.volume = v;
        set.highB.volume = v;
        set.lowA.volume = v;
        set.lowB.volume = v;
        set.strongA.volume = v;
        set.strongB.volume = v;
      });
    } catch (e) {}
  }, [volume, allPlayers]);

  const persistSettings = useCallback(
    (overrides: Record<string, any> = {}) => {
      const current = {
        bpm,
        beatsPerMeasure,
        subdivisions: 1,
        subdivisionPattern,
        beatSubdivisions,
        volume,
        sampleVolume,
        backgroundPlay,
        soundSet,
        flashMode,
        hapticMode,
        audioOffsetMs,
        timerStopMode,
        ...overrides,
      };
      saveSettings(current);
    },
    [bpm, beatsPerMeasure, subdivisionPattern, beatSubdivisions, volume, sampleVolume, backgroundPlay, soundSet, flashMode, hapticMode, audioOffsetMs, timerStopMode]
  );

  const updateVolume = useCallback(
    (newVolume: number) => {
      setVolume(newVolume);
      persistSettings({ volume: newVolume });
    },
    [persistSettings]
  );

  const updateSampleVolume = useCallback(
    (newVol: number) => {
      setSampleVolume(newVol);
      sampleVolumeRef.current = newVol;
      const MAX_SAMPLE_VOL = 5.0;
      for (const player of Object.values(noteSampleSoundsRef.current)) {
        try { player.volume = newVol * MAX_SAMPLE_VOL; } catch {}
      }
      persistSettings({ sampleVolume: newVol });
      scheduleReRender();
    },
    [persistSettings, scheduleReRender]
  );

  useEffect(() => {
    const MAX_SAMPLE_VOL = 5.0;
    for (const player of Object.values(noteSampleSoundsRef.current)) {
      try { player.volume = sampleVolume * MAX_SAMPLE_VOL; } catch {}
    }
  }, [sampleVolume]);

  const updateBackgroundPlay = useCallback(
    (value: boolean) => {
      setBackgroundPlay(value);
      persistSettings({ backgroundPlay: value });
    },
    [persistSettings]
  );

  const updateSoundSet = useCallback(
    (value: SoundSet) => {
      setSoundSet(value);
      persistSettings({ soundSet: value });
    },
    [persistSettings]
  );

  const updateFlashMode = useCallback(
    (value: FlashMode) => {
      setFlashMode(value);
      flashModeRef.current = value;
      persistSettings({ flashMode: value });
    },
    [persistSettings]
  );

  const updateHapticMode = useCallback(
    (value: HapticMode) => {
      setHapticMode(value);
      engineRef.current?.setHapticMode(value);
      persistSettings({ hapticMode: value });
    },
    [persistSettings]
  );

  const updateAudioOffset = useCallback(
    (value: number) => {
      setAudioOffsetMs(value);
      engineRef.current?.setAudioOffsetMs(value);
      persistSettings({ audioOffsetMs: value });
    },
    [persistSettings]
  );

  const updateBpm = useCallback(
    (newBpm: number) => {
      const clampedBpm = Math.max(20, Math.min(300, newBpm));
      setBpm(clampedBpm);
      engineRef.current?.setBpm(clampedBpm);
      persistSettings({ bpm: clampedBpm });
      scheduleReRender();
    },
    [persistSettings, scheduleReRender]
  );

  const updateTimeSignature = useCallback(
    (beats: number) => {
      const newTypes = defaultBeatTypes(beats);
      setBeatsPerMeasure(beats);
      setBeatTypes(newTypes);
      engineRef.current?.setBeatsPerMeasure(beats);
      engineRef.current?.setBeatTypes(newTypes);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      const cleaned: Record<string, BeatType[]> = {};
      for (const [k, v] of Object.entries(beatSubdivisions)) {
        if (Number(k) < beats) cleaned[k] = v;
      }
      setBeatSubdivisions(cleaned);
      if (barModeRef.current) {
        barConfigRef.current.beatsPerMeasure = beats;
        barConfigRef.current.beatTypes = newTypes;
        barConfigRef.current.beatSubdivisions = cleaned;
      } else {
        dialConfigRef.current.beatsPerMeasure = beats;
        dialConfigRef.current.beatTypes = newTypes;
        dialConfigRef.current.beatSubdivisions = cleaned;
        persistSettings({ beatsPerMeasure: beats, beatSubdivisions: cleaned });
      }
    },
    [persistSettings, beatSubdivisions]
  );

  const handleBeatTypeChange = useCallback(
    (index: number, type: BeatType) => {
      setBeatTypes((prev) => {
        const next = [...prev];
        next[index] = type;
        if (barModeRef.current) {
          barConfigRef.current.beatTypes = next;
        } else {
          dialConfigRef.current.beatTypes = next;
        }
        return next;
      });
      const engine = engineRef.current;
      if (engine) {
        const currentTypes = [...engine.getBeatTypes()];
        currentTypes[index] = type;
        engine.setBeatTypes(currentTypes);
      }
    },
    []
  );

  const barModeRef = useRef(barMode);
  useEffect(() => { barModeRef.current = barMode; }, [barMode]);
  const barStartBeatRef = useRef(barStartBeat);
  useEffect(() => { barStartBeatRef.current = barStartBeat; }, [barStartBeat]);
  const barLoopModeRef = useRef(barLoopMode);
  useEffect(() => { barLoopModeRef.current = barLoopMode; }, [barLoopMode]);

  const togglePlayPause = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || isPreparing) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    const modeLabel = barModeRef.current ? "Bar" : "Dial";
    if (isPlaying) {
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPlaying(false);
      setCurrentBeat(-1);
      setActiveSubNote(-1);
      showPausedNotification(bpm, modeLabel);
      if (loggingEnabled && practiceStartRef.current) {
        const dur = Math.round((Date.now() - practiceStartRef.current) / 1000);
        if (dur >= 3) {
          const noteRef = loadedPracticeNoteRef.current;
          addActivityLog({
            type: "practice_session",
            data: {
              bpm,
              mode: barMode ? "bar" : "dial",
              duration: dur,
              ...(barMode ? { barConfig: { beatsPerMeasure, subdivisions: subdivisionPattern.length } } : {}),
              ...(barMode && noteRef ? { practiceNoteId: noteRef.id, practiceNoteLabel: noteRef.label } : {}),
            },
          }).then(() => checkCompletedGoals());
        }
        practiceStartRef.current = null;
      }
    } else {
      const startBeat = barModeRef.current ? barStartBeatRef.current : undefined;
      setIsPreparing(true);
      showPlayingNotification(bpm, modeLabel);
      if (loggingEnabled) {
        practiceStartRef.current = Date.now();
      }

      if (barModeRef.current) {
        engine.setAllBarRepeats(barConfigRef.current.barRepeats || {});
        engine.setLoopBlocks(barConfigRef.current.loopBlocks || []);
      }
      engine.buildScheduleOnly();

      const renderedPlayer = await buildRenderedPlayer();
      if (renderedPlayer) {
        stopRenderedAudio();
        renderedPlayerRef.current = renderedPlayer;
        engine.setPreRenderedAudio(true);
        renderedPlayer.play();
      } else {
        engine.setPreRenderedAudio(false);
      }
      setIsPreparing(false);
      setIsPlaying(true);
      engine.start(startBeat ?? undefined);

      if (barModeRef.current && barLoopModeRef.current === "once") {
        engine.requestStopAfterMeasure();
      }

      if (startBeat && startBeat > 0) {
        setTimeout(() => {
          const beatDurMs = 60000 / bpm;
          const samples = noteSamplesRef.current;
          for (const [key, uri] of Object.entries(samples)) {
            const [bStr, sStr] = key.split("-");
            const trigBeat = parseInt(bStr, 10);
            const trigSub = parseInt(sStr, 10);
            if (isNaN(trigBeat) || isNaN(trigSub) || trigBeat >= startBeat) continue;

            const hashParts = uri.split("#t=")[1];
            let sampleStartMs = 0;
            let sampleEndMs = 0;
            if (hashParts) {
              const parts = hashParts.split(",").map(Number);
              if (!isNaN(parts[0])) sampleStartMs = parts[0];
              if (parts.length > 1 && !isNaN(parts[1])) sampleEndMs = parts[1];
            }
            const sampleDurMs = sampleEndMs > sampleStartMs ? sampleEndMs - sampleStartMs : 0;
            if (sampleDurMs <= 0) continue;

            let elapsedMs = 0;
            const curBarRepeats = barConfigRef.current.barRepeats || {};
            for (let b = trigBeat; b < startBeat; b++) {
              const pat = engine.getBeatSubdivision(b);
              const subCount = pat ? pat.length : 1;
              const rep = curBarRepeats[b];
              let repeatCount = 1;
              if (rep) {
                if (rep.type === "count") repeatCount = Math.max(1, rep.value);
                else repeatCount = Math.max(1, Math.round((rep.value * 1000) / beatDurMs));
              }
              if (b === trigBeat) {
                elapsedMs += (subCount - trigSub) * (beatDurMs / subCount);
                elapsedMs += (repeatCount - 1) * beatDurMs;
              } else {
                elapsedMs += beatDurMs * repeatCount;
              }
            }

            if (elapsedMs < sampleDurMs) {
              const player = noteSampleSoundsRef.current[key];
              if (player) {
                const seekToMs = sampleStartMs + elapsedMs;
                const remainingMs = sampleDurMs - elapsedMs;
                samplePlayStateRef.current[key] = { playing: true, endTimer: null };
                player.seekTo(seekToMs / 1000).then(() => {
                  player.play();
                  if (remainingMs > 0) {
                    const timer = setTimeout(() => {
                      try { player.pause(); } catch {}
                      if (samplePlayStateRef.current[key]) {
                        samplePlayStateRef.current[key].playing = false;
                        samplePlayStateRef.current[key].endTimer = null;
                      }
                    }, remainingMs);
                    if (samplePlayStateRef.current[key]) {
                      samplePlayStateRef.current[key].endTimer = timer;
                    }
                  }
                }).catch(() => {});
              }
            }
          }
        }, 0);
      }
    }
  }, [isPlaying, loggingEnabled, bpm, barMode, beatsPerMeasure]);

  const togglePlayPauseRef = useRef(togglePlayPause);
  useEffect(() => { togglePlayPauseRef.current = togglePlayPause; }, [togglePlayPause]);
  const updateBpmRef = useRef(updateBpm);
  useEffect(() => { updateBpmRef.current = updateBpm; }, [updateBpm]);
  const bpmRef = useRef(bpm);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const bpmTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bpmTapCountRef = useRef<{ direction: string; count: number }>({ direction: "", count: 0 });

  useEffect(() => {
    const sub = addNotificationActionListener((actionId) => {
      if (actionId === "TOGGLE_PLAY") {
        togglePlayPauseRef.current();
        return;
      }

      if (actionId === "BPM_DOWN" || actionId === "BPM_UP") {
        const dir = actionId;

        if (bpmTapCountRef.current.direction === dir && bpmTapTimerRef.current) {
          clearTimeout(bpmTapTimerRef.current);
          bpmTapTimerRef.current = null;
          bpmTapCountRef.current = { direction: "", count: 0 };

          const delta = dir === "BPM_DOWN" ? -5 : 5;
          const newBpm = Math.max(20, Math.min(300, bpmRef.current + delta));
          updateBpmRef.current(newBpm);
          const modeLabel = barModeRef.current ? "Bar" : "Dial";
          updateNotificationBpm(newBpm, modeLabel);
        } else {
          if (bpmTapTimerRef.current) {
            clearTimeout(bpmTapTimerRef.current);
          }
          bpmTapCountRef.current = { direction: dir, count: 1 };

          bpmTapTimerRef.current = setTimeout(() => {
            bpmTapTimerRef.current = null;
            bpmTapCountRef.current = { direction: "", count: 0 };

            const delta = dir === "BPM_DOWN" ? -1 : 1;
            const newBpm = Math.max(20, Math.min(300, bpmRef.current + delta));
            updateBpmRef.current(newBpm);
            const modeLabel = barModeRef.current ? "Bar" : "Dial";
            updateNotificationBpm(newBpm, modeLabel);
          }, 300);
        }
      }
    });
    return () => {
      sub.remove();
      if (bpmTapTimerRef.current) clearTimeout(bpmTapTimerRef.current);
    };
  }, []);

  const handleBarModeChange = useCallback((toBarMode: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;

    if (isPlaying) {
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPlaying(false);
      setCurrentBeat(-1);
      setActiveSubNote(-1);
    }
    setBarStartBeat(null);

    if (toBarMode) {
      dialConfigRef.current = {
        beatsPerMeasure,
        beatTypes: [...beatTypes],
        beatSubdivisions: { ...beatSubdivisions },
      };
      const defaultBeats = 4;
      const defaultTypes = defaultBeatTypes(defaultBeats);
      barConfigRef.current = {
        beatsPerMeasure: defaultBeats,
        beatTypes: [...defaultTypes],
        beatSubdivisions: {},
        barRepeats: {},
        barClockMode: "stopwatch",
        barTimerDuration: 180,
      };
      setBeatsPerMeasure(defaultBeats);
      setBeatTypes([...defaultTypes]);
      setBeatSubdivisions({});
      setBarRepeats({});
      setLoopBlocks([]);
      setBarLoopMode("loop");
      setNoteSamples({});
      noteSamplesRef.current = {};
      setNoteSampleNames({});
      noteSampleNamesRef.current = {};
      setNoteSampleSources({});
      noteSampleSourcesRef.current = {};
      engine.setBeatsPerMeasure(defaultBeats);
      engine.setBeatTypes([...defaultTypes]);
      engine.setAllBeatSubdivisions({});
      engine.clearLoopBlocks();
      engine.clearBarRepeats();
    } else {
      barConfigRef.current = {
        ...barConfigRef.current,
        beatsPerMeasure,
        beatTypes: [...beatTypes],
        beatSubdivisions: { ...beatSubdivisions },
        barRepeats: { ...barRepeats },
        loopBlocks: [...loopBlocks],
      };
      const dc = dialConfigRef.current;
      setBeatsPerMeasure(dc.beatsPerMeasure);
      setBeatTypes([...dc.beatTypes]);
      setBeatSubdivisions({ ...dc.beatSubdivisions });
      setBarRepeats({});
      setLoopBlocks([]);
      engine.setBeatsPerMeasure(dc.beatsPerMeasure);
      engine.setBeatTypes([...dc.beatTypes]);
      engine.setAllBeatSubdivisions(dc.beatSubdivisions);
      engine.clearLoopBlocks();
      engine.clearBarRepeats();
    }

    setBarMode(toBarMode);
  }, [isPlaying, beatsPerMeasure, beatTypes, beatSubdivisions, barRepeats, loopBlocks]);

  const startMetronome = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || isPlaying || isPreparing) return;
    setIsPreparing(true);
    if (barModeRef.current) {
      engine.setAllBarRepeats(barConfigRef.current.barRepeats || {});
      engine.setLoopBlocks(barConfigRef.current.loopBlocks || []);
    }
    engine.buildScheduleOnly();

    const renderedPlayer = await buildRenderedPlayer();
    if (renderedPlayer) {
      stopRenderedAudio();
      renderedPlayerRef.current = renderedPlayer;
      engine.setPreRenderedAudio(true);
      renderedPlayer.play();
    } else {
      engine.setPreRenderedAudio(false);
    }
    setIsPreparing(false);
    setIsPlaying(true);
    engine.start();
  }, [isPlaying, isPreparing, buildRenderedPlayer, stopRenderedAudio]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setOnMeasureComplete(() => {
      if (!engine.getIsRunning()) {
        if (renderedPlayerRef.current) {
          try { renderedPlayerRef.current.pause(); renderedPlayerRef.current.release(); } catch {}
          renderedPlayerRef.current = null;
        }
        for (const [k, st] of Object.entries(samplePlayStateRef.current)) {
          if (st.endTimer) clearTimeout(st.endTimer);
        }
        samplePlayStateRef.current = {};
        for (const snd of Object.values(noteSampleSoundsRef.current)) {
          try { snd.pause(); } catch {}
        }
        setIsPlaying(false);
        setCurrentBeat(-1);
        setActiveSubNote(-1);
        const modeLabel = barModeRef.current ? "Bar" : "Dial";
        showPausedNotification(bpmRef.current, modeLabel);
      }
    });
  }, []);

  const timerStopModeRef = useRef(timerStopMode);
  useEffect(() => { timerStopModeRef.current = timerStopMode; }, [timerStopMode]);

  const handleTimerExpired = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (timerStopModeRef.current === "immediate") {
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPlaying(false);
      setCurrentBeat(-1);
      const modeLabel = barModeRef.current ? "Bar" : "Dial";
      showPausedNotification(bpmRef.current, modeLabel);
    } else {
      engine.requestStopAfterMeasure();
    }
  }, []);

  const updateTimerStopMode = useCallback(
    (mode: "immediate" | "end-of-cycle") => {
      setTimerStopMode(mode);
      persistSettings({ timerStopMode: mode });
    },
    [persistSettings]
  );

  const updateUsername = useCallback(
    (name: string) => {
      setUsername(name);
      persistSettings({ username: name });
    },
    [persistSettings]
  );

  const handleTapTempo = useCallback(() => {
    const now = Date.now();
    const taps = tapTimesRef.current;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (taps.length > 0 && now - taps[taps.length - 1] > 2500) {
      tapTimesRef.current = [];
    }

    taps.push(now);

    if (taps.length > 8) {
      taps.shift();
    }

    if (taps.length >= 2) {
      let totalInterval = 0;
      for (let i = 1; i < taps.length; i++) {
        totalInterval += taps[i] - taps[i - 1];
      }
      const avgInterval = totalInterval / (taps.length - 1);
      const detectedBpm = Math.round(60000 / avgInterval);
      updateBpm(detectedBpm);
    }

    tapTimesRef.current = taps;
  }, [updateBpm]);

  const handleBeatSubdivisionChange = useCallback(
    (beatIndex: number, pattern: BeatType[] | null) => {
      const newSubs = { ...beatSubdivisions };
      if (pattern && pattern.length > 1) {
        newSubs[String(beatIndex)] = pattern;
        engineRef.current?.setBeatSubdivision(beatIndex, pattern);
      } else {
        delete newSubs[String(beatIndex)];
        engineRef.current?.setBeatSubdivision(beatIndex, null);
      }
      setBeatSubdivisions(newSubs);
      if (barModeRef.current) {
        barConfigRef.current.beatSubdivisions = newSubs;
      } else {
        dialConfigRef.current.beatSubdivisions = newSubs;
        persistSettings({ beatSubdivisions: newSubs });
      }
    },
    [beatSubdivisions, persistSettings]
  );

  const handlePatternChange = useCallback(
    (pattern: BeatType[]) => {
      setSubdivisionPattern(pattern);
      persistSettings({ subdivisionPattern: pattern });
    },
    [persistSettings]
  );

  const handleReset = useCallback(() => {
    setSubdivisionPattern(["accent"]);
    const emptySubs: Record<string, BeatType[]> = {};
    setBeatSubdivisions(emptySubs);
    for (let i = 0; i < beatsPerMeasure; i++) {
      engineRef.current?.setBeatSubdivision(i, null);
    }
    persistSettings({
      subdivisionPattern: ["accent"],
      beatSubdivisions: emptySubs,
    });
  }, [beatsPerMeasure, persistSettings]);

  const measureDialCenter = useCallback(() => {
    if (!dialRef.current) return;
    if (Platform.OS === "web") {
      const el = dialRef.current as unknown as HTMLElement;
      if (el?.getBoundingClientRect) {
        const rect = el.getBoundingClientRect();
        dialCenterRef.current = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
    } else {
      const ref = dialRef.current as any;
      if (ref?.measureInWindow) {
        ref.measureInWindow(
          (x: number, y: number, w: number, h: number) => {
            if (w > 0 && h > 0) {
              dialCenterRef.current = { x: x + w / 2, y: y + h / 2 };
            }
          }
        );
      } else if (ref?.measure) {
        ref.measure(
          (
            _x: number,
            _y: number,
            w: number,
            h: number,
            pageX: number,
            pageY: number
          ) => {
            if (w > 0 && h > 0) {
              dialCenterRef.current = { x: pageX + w / 2, y: pageY + h / 2 };
            }
          }
        );
      }
    }
  }, []);

  const CENTER_HUB_RADIUS = 55;

  const measureBarArea = useCallback(() => {
    const ref = barAreaRef.current as any;
    if (!ref) return;
    if (Platform.OS === "web" && ref?.getBoundingClientRect) {
      const rect = ref.getBoundingClientRect();
      barAreaLayoutRef.current = { y: rect.top, height: rect.height };
    } else if (ref?.measure) {
      ref.measure((_x: number, _y: number, _w: number, h: number, _px: number, py: number) => {
        barAreaLayoutRef.current = { y: py, height: h };
      });
    }
  }, []);

  const findDropTarget = useCallback(
    (pageX: number, pageY: number): number | null => {
      if (barMode) {
        const layout = barAreaLayoutRef.current;
        if (layout.height <= 0) return null;
        const relY = pageY - layout.y;
        if (relY < -60) return null;
        if (relY < 0) return -1;
        if (relY > layout.height) return null;
        const BAR_HEIGHT = 36;
        const barGap = 18;
        const rowH = BAR_HEIGHT + 1 + barGap;
        const scrollY = barScrollOffsetRef.current;
        const contentY = relY + scrollY;
        const centerPad = Math.max(0, (layout.height - BAR_HEIGHT) / 2);
        const adjustedY = contentY - centerPad;
        const beatIdx = Math.floor(adjustedY / rowH);
        if (beatIdx >= 0 && beatIdx < beatsPerMeasure) return beatIdx;
        return null;
      }

      const center = dialCenterRef.current;
      if (center.x === 0 && center.y === 0) return null;

      const distToCenter = Math.sqrt(
        (pageX - center.x) ** 2 + (pageY - center.y) ** 2
      );
      if (distToCenter < CENTER_HUB_RADIUS) return -1;

      let closestBeat: number | null = null;
      let closestDist = Infinity;

      for (let i = 0; i < beatsPerMeasure; i++) {
        const angle = (i / beatsPerMeasure) * 2 * Math.PI - Math.PI / 2;
        const dotX = center.x + DOT_RADIUS_FROM_CENTER * Math.cos(angle);
        const dotY = center.y + DOT_RADIUS_FROM_CENTER * Math.sin(angle);

        const dist = Math.sqrt((pageX - dotX) ** 2 + (pageY - dotY) ** 2);
        if (dist < closestDist) {
          closestDist = dist;
          closestBeat = i;
        }
      }

      if (closestDist < 40) return closestBeat;
      return null;
    },
    [beatsPerMeasure, barMode]
  );

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
    if (barMode) {
      measureBarArea();
    } else {
      measureDialCenter();
    }
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [measureDialCenter, measureBarArea, barMode]);

  const handleDragMove = useCallback(
    (pageX: number, pageY: number) => {
      setDragPos({ x: pageX, y: pageY });
      const target = findDropTarget(pageX, pageY);
      setDropTargetBeat(target);
    },
    [findDropTarget]
  );

  const applyToAllBeats = useCallback(
    (pattern: BeatType[]) => {
      const newSubs: Record<string, BeatType[]> = {};
      for (let i = 0; i < beatsPerMeasure; i++) {
        if (pattern.length > 1) {
          newSubs[String(i)] = [...pattern];
          engineRef.current?.setBeatSubdivision(i, pattern);
        } else {
          engineRef.current?.setBeatSubdivision(i, null);
        }
      }
      setBeatSubdivisions(newSubs);
      persistSettings({ beatSubdivisions: newSubs });
    },
    [beatsPerMeasure, persistSettings]
  );

  const handleDragEnd = useCallback(
    (pageX: number, pageY: number) => {
      const target = findDropTarget(pageX, pageY);
      setIsDragging(false);
      setDropTargetBeat(null);

      if (target === -1) {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        applyToAllBeats(subdivisionPattern);
      } else if (target !== null && subdivisionPattern.length > 1) {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        const newSubs = { ...beatSubdivisions };
        newSubs[String(target)] = [...subdivisionPattern];
        setBeatSubdivisions(newSubs);
        engineRef.current?.setBeatSubdivision(target, subdivisionPattern);
        persistSettings({ beatSubdivisions: newSubs });
      } else if (target !== null && subdivisionPattern.length <= 1) {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        const newSubs = { ...beatSubdivisions };
        delete newSubs[String(target)];
        setBeatSubdivisions(newSubs);
        engineRef.current?.setBeatSubdivision(target, null);
        persistSettings({ beatSubdivisions: newSubs });
      }
    },
    [findDropTarget, subdivisionPattern, beatSubdivisions, persistSettings, applyToAllBeats]
  );

  const handleBarRepeatChange = useCallback((beat: number, repeat: BarRepeat | null) => {
    setBarRepeats(prev => {
      const next = { ...prev };
      if (repeat) {
        next[beat] = repeat;
      } else {
        delete next[beat];
      }
      barConfigRef.current.barRepeats = { ...next };
      engineRef.current?.setBarRepeat(beat, repeat);
      return next;
    });
  }, []);

  const handleLoopBlocksChange = useCallback((blocks: LoopBlock[]) => {
    setLoopBlocks(blocks);
    engineRef.current?.setLoopBlocks(blocks);
    barConfigRef.current.loopBlocks = [...blocks];
  }, []);

  useEffect(() => {
    if (loopBlocks.length === 0) return;
    const clamped = loopBlocks
      .map(b => ({
        ...b,
        startBeat: Math.min(b.startBeat, beatsPerMeasure - 1),
        endBeat: Math.min(b.endBeat, beatsPerMeasure - 1),
      }))
      .filter(b => b.startBeat <= b.endBeat);
    const changed = clamped.length !== loopBlocks.length || clamped.some((b, i) => b.startBeat !== loopBlocks[i].startBeat || b.endBeat !== loopBlocks[i].endBeat);
    if (changed) {
      handleLoopBlocksChange(clamped);
    }
  }, [beatsPerMeasure]);

  const beatSubdivisionCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const [k, v] of Object.entries(beatSubdivisions)) {
      counts[Number(k)] = v.length;
    }
    return counts;
  }, [beatSubdivisions]);

  const currentBarConfig = useMemo(() => {
    if (!barMode) return null;
    return {
      bpm,
      beatsPerMeasure,
      beatTypes: [...beatTypes],
      beatSubdivisions: { ...beatSubdivisions },
      barRepeats: { ...barRepeats },
      loopBlocks: [...loopBlocks],
      barLoopMode: barLoopMode as "loop" | "once",
      subdivisionPattern: [...subdivisionPattern],
      barClockMode: barConfigRef.current.barClockMode,
      barTimerDuration: barConfigRef.current.barTimerDuration,
    };
  }, [barMode, bpm, beatsPerMeasure, beatTypes, beatSubdivisions, barRepeats, loopBlocks, barLoopMode, subdivisionPattern]);

  const handleLoadPracticeEntry = useCallback((entry: PracticeEntry) => {
    const engine = engineRef.current;
    if (!engine) return;

    if (isPlaying) {
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPlaying(false);
      setCurrentBeat(-1);
      setActiveSubNote(-1);
    }

    if (!barMode) {
      dialConfigRef.current = {
        beatsPerMeasure,
        beatTypes: [...beatTypes],
        beatSubdivisions: { ...beatSubdivisions },
      };
      setBarMode(true);
    }

    setBpm(entry.bpm);
    setBeatsPerMeasure(entry.beatsPerMeasure);
    setBeatTypes([...entry.beatTypes]);
    setBeatSubdivisions({ ...entry.beatSubdivisions });
    setBarRepeats({ ...entry.barRepeats });
    const entryBlocks = (entry as any).loopBlocks || [];
    setLoopBlocks([...entryBlocks]);
    setBarLoopMode(entry.barLoopMode);
    setSubdivisionPattern([...entry.subdivisionPattern]);

    engine.setBpm(entry.bpm);
    engine.setBeatsPerMeasure(entry.beatsPerMeasure);
    engine.setBeatTypes([...entry.beatTypes]);
    engine.setAllBeatSubdivisions(entry.beatSubdivisions);
    engine.setLoopBlocks(entryBlocks);
    engine.setAllBarRepeats(entry.barRepeats || {});
    barConfigRef.current = {
      beatsPerMeasure: entry.beatsPerMeasure,
      beatTypes: [...entry.beatTypes],
      beatSubdivisions: { ...entry.beatSubdivisions },
      barRepeats: { ...entry.barRepeats },
      loopBlocks: [...entryBlocks],
      barClockMode: entry.barClockMode || "stopwatch",
      barTimerDuration: entry.barTimerDuration ?? 180,
    };
    loadedPracticeNoteRef.current = { id: entry.id, label: entry.label };
  }, [isPlaying, barMode, beatsPerMeasure, beatTypes, beatSubdivisions]);

  const handleDeepLinkImport = useCallback((url: string) => {
    try {
      const parsed = Linking.parse(url);
      if (parsed.path === "practice" && parsed.queryParams?.d) {
        const decoded = JSON.parse(atob(decodeURIComponent(parsed.queryParams.d as string)));
        if (decoded && decoded.bpm && decoded.beatTypes) {
          const entry: PracticeEntry = {
            id: Crypto.randomUUID(),
            ...decoded,
          };
          Alert.alert(
            "설정 가져오기",
            `"${entry.label}" 설정을 적용하시겠습니까?\n\nBPM: ${entry.bpm} | ${entry.beatsPerMeasure} beats`,
            [
              { text: "취소", style: "cancel" },
              {
                text: "적용",
                onPress: () => handleLoadPracticeEntry(entry),
              },
              {
                text: "저장 후 적용",
                onPress: async () => {
                  const { loadPracticeBook: lpb, savePracticeBook: spb } = await import("@/lib/storage");
                  const existing = await lpb();
                  await spb([entry, ...existing]);
                  handleLoadPracticeEntry(entry);
                  Alert.alert("저장 완료", `"${entry.label}" 이(가) Practice Note에 저장되었습니다.`);
                },
              },
            ]
          );
        }
      }
    } catch (e) {
      console.warn("Deep link parse error:", e);
    }
  }, [handleLoadPracticeEntry]);

  useEffect(() => {
    const handleUrl = (event: { url: string }) => handleDeepLinkImport(event.url);
    const sub = Linking.addEventListener("url", handleUrl);
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLinkImport(url);
    });
    return () => sub.remove();
  }, [handleDeepLinkImport]);

  const pendingImportProcessed = useRef(false);
  useEffect(() => {
    if (pendingImportProcessed.current) return;
    const timer = setTimeout(async () => {
      const { consumePendingImport } = require("@/lib/pending-import");
      const decoded = consumePendingImport();
      if (decoded && decoded.bpm && decoded.beatTypes) {
        pendingImportProcessed.current = true;
        const entry: PracticeEntry = {
          id: Crypto.randomUUID(),
          ...decoded,
        };
        const { loadPracticeBook: lpb, savePracticeBook: spb } = await import("@/lib/storage");
        const existing = await lpb();
        await spb([entry, ...existing]);
        handleLoadPracticeEntry(entry);
        Alert.alert("설정 가져오기 완료", `"${entry.label}" 설정이 적용되고 Practice Note에 저장되었습니다.\n\nBPM: ${entry.bpm} | ${entry.beatsPerMeasure} beats`);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [handleLoadPracticeEntry]);

  const handleSetPracticeNoteGoal = useCallback(async (entry: PracticeEntry, targetMinutes: number) => {
    const goals = await loadGoals();
    const existing = goals.find((g) => g.type === "session_goal" && g.practiceNoteId === entry.id);
    if (existing) {
      const updated = goals.map((g) =>
        g.id === existing.id ? { ...g, target: targetMinutes, label: `♫ ${entry.label}` } : g
      );
      await saveGoals(updated);
      Alert.alert("목표 수정 완료", `"${entry.label}" 목표가 ${targetMinutes}분으로 변경되었습니다.`);
      return;
    }
    const newGoal: Goal = {
      id: Crypto.randomUUID(),
      type: "session_goal",
      target: targetMinutes,
      label: `♫ ${entry.label}`,
      practiceNoteId: entry.id,
      practiceNoteLabel: entry.label,
    };
    const updated = [...goals, newGoal];
    await saveGoals(updated);
    Alert.alert("목표 설정 완료", `"${entry.label}" 연습 목표가 추가되었습니다 (${targetMinutes}분).`);
  }, []);

  const tempoLabel = getTempoLabel(bpm);

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  if (!isLoaded) {
    return (
      <View style={[styles.screen, { backgroundColor: Colors.background }]} />
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[Colors.background, "#0A0E14", Colors.background]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: C.accent,
            pointerEvents: "none" as const,
          },
          flashStyle,
        ]}
      />

      <Pressable
        style={[
          styles.menuButton,
          { top: (insets.top || webTopInset) + 12 },
        ]}
        onPress={() => setShowMenu(!showMenu)}
        hitSlop={8}
        testID="menu-button"
      >
        <Ionicons name="menu" size={22} color={Colors.textSecondary} />
      </Pressable>

      {showMenu && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
          <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)}>
            <View style={[styles.menuDropdown, { top: (insets.top || webTopInset) + 52 }]}>
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={() => {
                  setShowMenu(false);
                  setShowTuner(true);
                  if (loggingEnabled) featureStartRef.current = { name: "tuner", start: Date.now() };
                }}
              >
                <MaterialCommunityIcons name="tune-variant" size={18} color={C.accent} />
                <Text style={styles.menuItemText}>Tuner</Text>
              </Pressable>
              <View style={styles.menuDivider} />
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={() => {
                  setShowMenu(false);
                  setShowSignalGen(true);
                  if (loggingEnabled) featureStartRef.current = { name: "signal_generator", start: Date.now() };
                }}
              >
                <MaterialCommunityIcons name="waveform" size={18} color={C.accent} />
                <Text style={styles.menuItemText}>Signal Generator</Text>
              </Pressable>
              <View style={styles.menuDivider} />
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={() => {
                  setShowMenu(false);
                  setShowPracticeBook(true);
                  if (loggingEnabled) featureStartRef.current = { name: "practice_note", start: Date.now() };
                }}
              >
                <MaterialCommunityIcons name="notebook-outline" size={18} color={C.accent} />
                <Text style={styles.menuItemText}>Practice Note</Text>
              </Pressable>
              <View style={styles.menuDivider} />
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={() => {
                  setShowMenu(false);
                  setShowWorkUp(true);
                }}
              >
                <MaterialCommunityIcons name="chart-line" size={18} color={C.accent} />
                <Text style={styles.menuItemText}>Work Up</Text>
              </Pressable>
              <View style={styles.menuDivider} />
              <Pressable
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={() => {
                  setShowMenu(false);
                  setShowSettings(true);
                }}
              >
                <Ionicons name="settings-outline" size={18} color={Colors.textSecondary} />
                <Text style={styles.menuItemText}>Settings</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}

      <TunerModal
        visible={showTuner}
        onClose={() => {
          setShowTuner(false);
          if (loggingEnabled && featureStartRef.current?.name === "tuner") {
            const dur = Math.round((Date.now() - featureStartRef.current.start) / 1000);
            if (dur >= 2) addActivityLog({ type: "feature_usage", data: { feature: "tuner", duration: dur } });
            featureStartRef.current = null;
          }
        }}
      />

      <SignalGeneratorModal
        visible={showSignalGen}
        onClose={() => {
          setShowSignalGen(false);
          if (loggingEnabled && featureStartRef.current?.name === "signal_generator") {
            const dur = Math.round((Date.now() - featureStartRef.current.start) / 1000);
            if (dur >= 2) addActivityLog({ type: "feature_usage", data: { feature: "signal_generator", duration: dur } });
            featureStartRef.current = null;
          }
        }}
      />

      <NoteRecorderModal
        visible={recorderTarget !== null}
        onClose={() => setRecorderTarget(null)}
        onSave={handleNoteRecordSave}
        onDelete={handleNoteRecordDelete}
        beatIndex={recorderTarget?.beat ?? 0}
        subIndex={recorderTarget?.sub ?? 0}
        hasExisting={recorderTarget ? hasNoteSample(recorderTarget.beat, recorderTarget.sub, noteSamples) : false}
        existingName={recorderTarget ? (noteSampleNames[`${recorderTarget.beat}-${recorderTarget.sub}`] || "") : ""}
      />

      <PracticeBookModal
        visible={showPracticeBook}
        onClose={() => {
          setShowPracticeBook(false);
          if (loggingEnabled && featureStartRef.current?.name === "practice_note") {
            const dur = Math.round((Date.now() - featureStartRef.current.start) / 1000);
            if (dur >= 2) addActivityLog({ type: "feature_usage", data: { feature: "practice_note", duration: dur } });
            featureStartRef.current = null;
          }
        }}
        onLoad={handleLoadPracticeEntry}
        onSetGoal={handleSetPracticeNoteGoal}
        currentConfig={currentBarConfig}
        username={username}
      />

      <WorkUpOverviewModal
        visible={showWorkUp}
        onClose={() => setShowWorkUp(false)}
        loggingEnabled={loggingEnabled}
        roomTrackingActive={roomTrackingActive}
        trackingRoomName={trackingRoomName}
        onStartRoomTracking={startRoomTracking}
        onStopRoomTracking={stopRoomTracking}
      />

      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        volume={volume}
        onVolumeChange={updateVolume}
        sampleVolume={sampleVolume}
        onSampleVolumeChange={updateSampleVolume}
        backgroundPlay={backgroundPlay}
        onBackgroundPlayChange={updateBackgroundPlay}
        soundSet={soundSet}
        onSoundSetChange={updateSoundSet}
        flashMode={flashMode}
        onFlashModeChange={updateFlashMode}
        hapticMode={hapticMode}
        onHapticModeChange={updateHapticMode}
        audioOffsetMs={audioOffsetMs}
        onAudioOffsetChange={updateAudioOffset}
        timerStopMode={timerStopMode}
        onTimerStopModeChange={updateTimerStopMode}
        loggingEnabled={loggingEnabled}
        onLoggingEnabledChange={(val) => {
          setLoggingEnabled(val);
          saveLoggingEnabled(val);
        }}
        username={username}
        onUsernameChange={updateUsername}
        roomTrackingActive={roomTrackingActive}
        trackingRoomName={trackingRoomName}
        onStartRoomTracking={startRoomTracking}
        onStopRoomTracking={stopRoomTracking}
      />

      {completedGoalPopups.length > 0 && !showMenu && !showTuner && !showSignalGen && !showPracticeBook && !showWorkUp && !showSettings && (
        <View style={[styles.goalPopupContainer, { top: (insets.top || webTopInset) + 8, pointerEvents: "box-none" }]}>
          {completedGoalPopups.map((goal) => {
            const goalColor = goal.type === "beat_mode_time" ? "#58A6FF" : goal.type === "bar_mode_time" ? "#F0883E" : goal.type === "room_time" ? "#A371F7" : C.accent;
            return (
              <Pressable
                key={`popup-${goal.id}`}
                style={[styles.goalPopup, { borderColor: goalColor, backgroundColor: Colors.surface }]}
                onPress={() => dismissGoalPopup(goal.id)}
              >
                <Ionicons name="checkmark-circle" size={22} color={goalColor} />
                <View style={styles.goalPopupInfo}>
                  <Text style={[styles.goalPopupTitle, { color: goalColor }]}>{goal.label} Complete!</Text>
                  <Text style={styles.goalPopupSub}>Tap to dismiss</Text>
                </View>
                <Ionicons name="close" size={16} color={Colors.textTertiary} />
              </Pressable>
            );
          })}
        </View>
      )}

      <View
        style={[
          styles.content,
          {
            paddingTop: (insets.top || webTopInset) + 16,
            paddingBottom: (insets.bottom || webBottomInset) + 16,
          },
        ]}
      >
        <View style={[styles.topSection, barMode && { justifyContent: "flex-start", flex: 3 }]}>
          <BeatIndicator
            beatsPerMeasure={beatsPerMeasure}
            currentBeat={currentBeat}
            isPlaying={isPlaying}
            isPreparing={isPreparing}
            onBeatsChange={updateTimeSignature}
            onTogglePlay={togglePlayPause}
            beatTypes={beatTypes}
            onBeatTypeChange={handleBeatTypeChange}
            dropTargetBeat={dropTargetBeat}
            beatSubdivisionCounts={beatSubdivisionCounts}
            dialRef={dialRef}
            barMode={barMode}
            onBarModeChange={handleBarModeChange}
            beatSubdivisions={beatSubdivisions}
            onBeatSubdivisionChange={handleBeatSubdivisionChange}
            activeSubNote={activeSubNote}
            barAreaRef={barAreaRef}
            barRepeats={barRepeats}
            onBarRepeatChange={handleBarRepeatChange}
            loopBlocks={loopBlocks}
            onLoopBlocksChange={handleLoopBlocksChange}
            barLoopMode={barLoopMode}
            onBarLoopModeChange={setBarLoopMode}
            onBarScrollOffset={(offset) => { barScrollOffsetRef.current = offset; }}
            onBarTimerExpired={handleTimerExpired}
            onBarClockConfigChange={(mode, dur) => {
              barConfigRef.current.barClockMode = mode;
              barConfigRef.current.barTimerDuration = dur;
            }}
            initialBarClockMode={barConfigRef.current.barClockMode}
            initialBarTimerDuration={barConfigRef.current.barTimerDuration}
            noteSamples={noteSamples}
            noteSampleNames={noteSampleNames}
            noteSampleSources={noteSampleSources}
            onNoteRecordRequest={handleNoteRecordRequest}
            bpm={bpm}
            barStartBeat={barStartBeat}
            onBarStartBeatSelect={setBarStartBeat}
            subdivisionBarElement={barMode ? (
              <SubdivisionBar
                pattern={subdivisionPattern}
                onPatternChange={handlePatternChange}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
                onReset={handleReset}
                isPlaying={isPlaying}
                activeSubNote={activeSubNote}
                activeBeatPattern={isPlaying && currentBeat >= 0 ? (beatSubdivisions[String(currentBeat)] || null) : null}
              />
            ) : undefined}
          />
        </View>

        <View style={styles.bpmSection}>
          {!barMode && (
            <SubdivisionBar
              pattern={subdivisionPattern}
              onPatternChange={handlePatternChange}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onReset={handleReset}
              isPlaying={isPlaying}
              activeSubNote={activeSubNote}
              activeBeatPattern={isPlaying && currentBeat >= 0 ? (beatSubdivisions[String(currentBeat)] || null) : null}
            />
          )}
          <Text style={[styles.tempoLabel, { color: C.accentMuted }]}>{tempoLabel}</Text>
          <BpmSlider
            bpm={bpm}
            onBpmChange={updateBpm}
            onTapTempo={handleTapTempo}
          />
        </View>
      </View>

      {!barMode && (
        <StopwatchTimer
          onTimerExpired={handleTimerExpired}
          onStopRequested={handleTimerExpired}
          onStartMetronome={startMetronome}
          isMetronomePlaying={isPlaying}
          topInset={insets.top || webTopInset}
        />
      )}

      {isDragging && (
        <DragGhost
          pattern={subdivisionPattern}
          x={dragPos.x}
          y={dragPos.y}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  topSection: {
    flex: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  bpmSection: {
    alignItems: "center",
    gap: 4,
  },
  tempoLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: moderateScale(14, 0.3),
    color: Colors.accentMuted,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  menuButton: {
    position: "absolute",
    right: 20,
    zIndex: 20,
    width: moderateScale(36, 0.3),
    height: moderateScale(36, 0.3),
    borderRadius: moderateScale(18, 0.3),
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  menuDropdown: {
    position: "absolute",
    right: 20,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 4,
    minWidth: moderateScale(160, 0.4),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: moderateScale(16, 0.3),
    paddingVertical: moderateScale(12, 0.3),
  },
  menuItemPressed: {
    backgroundColor: Colors.surfaceLight,
  },
  menuItemText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: moderateScale(14, 0.3),
    color: Colors.text,
  },
  menuDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 12,
    opacity: 0.5,
  },
  goalPopupContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 100,
    gap: 8,
  },
  goalPopup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  goalPopupInfo: {
    flex: 1,
    gap: 2,
  },
  goalPopupTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 14,
    letterSpacing: 0.2,
  },
  goalPopupSub: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
  },
});
