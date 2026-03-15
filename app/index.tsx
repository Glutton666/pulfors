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
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import type { ThemeColor } from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTempoLabel as getTempoLabelI18n } from "@/lib/i18n";
import { moderateScale } from "@/lib/scale";
import {
  MetronomeEngine,
  soundSets,
} from "@/lib/metronome-engine";
import type { BeatType } from "@/lib/metronome-engine";
import { loadSettings, saveSettings, loadCustomSoundSets, saveCustomSoundSets } from "@/lib/storage";
import type { FlashMode, HapticMode, SoundSet, BuiltinSoundSet, CustomSoundSetConfig, CustomSoundSample } from "@/lib/storage";
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
import { SignalGeneratorModal } from "@/components/SignalGeneratorModal";
import { PracticeBookModal } from "@/components/PracticeBookModal";
import { WorkUpOverviewModal } from "@/components/WorkUpOverviewModal";
import { OnboardingModal } from "@/components/OnboardingModal";
import type { OnboardingResult } from "@/components/OnboardingModal";
import type { PracticeEntry } from "@/lib/storage";
import { loadLoggingEnabled, saveLoggingEnabled, addActivityLog, loadActivityLogs, loadGoals, saveGoals } from "@/lib/activity-log";
import { loadNoteSamples, saveNoteSamples, setNoteSample, removeNoteSample, hasNoteSample, loadNoteSampleNames, saveNoteSampleNames, setNoteSampleName, removeNoteSampleName, loadNoteSampleSources, saveNoteSampleSources, setNoteSampleSource, removeNoteSampleSource } from "@/lib/note-samples";
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
  ensureWebClickBuffers,
  playWebClick,
  clearWebClickBuffers,
  playWebRenderedLoop,
  getWebAudioContext,
} from "@/lib/audio-renderer";
import type { ClickPCMs, SamplePCMEntry, TickInfo, DecodedSample } from "@/lib/audio-renderer";
import type { ActivityLog, Goal, PracticeSessionData, PracticeRoomVisitData } from "@/lib/activity-log";
import {
  loadPracticeRooms,
  getCurrentLocation,
  requestLocationPermission,
  findNearbyRoom,
  type PracticeRoom,
} from "@/lib/practice-room";


function defaultBeatTypes(beats: number): BeatType[] {
  return Array.from({ length: beats }, (_, i) =>
    i === 0 ? "accent" : "normal"
  );
}

export default function MetronomeScreen() {
  const insets = useSafeAreaInsets();
  const { setThemeColor, colors: C } = useTheme();
  const { language, t } = useLanguage();
  const languageRef = useRef(language);
  useEffect(() => { languageRef.current = language; }, [language]);

  const [bpm, setBpm] = useState(120);
  const [halfTime, setHalfTime] = useState(false);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const [beatTypes, setBeatTypes] = useState<BeatType[]>(defaultBeatTypes(4));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [measureCount, setMeasureCount] = useState(0);
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
  const [blockPlayMode, setBlockPlayMode] = useState<"sequential" | "loop" | "random">("loop");
  const [barRepeats, setBarRepeats] = useState<Record<number, BarRepeat>>({});
  const [loopBlocks, setLoopBlocks] = useState<LoopBlock[]>([]);
  const barAreaRef = useRef<View>(null);
  const barAreaLayoutRef = useRef({ y: 0, height: 0 });
  const barScrollOffsetRef = useRef(0);

  const dialConfigRef = useRef({
    beatsPerMeasure: 4,
    beatTypes: defaultBeatTypes(4),
    beatSubdivisions: {} as Record<string, BeatType[]>,
    noteSamples: {} as NoteSampleMap,
    noteSampleNames: {} as NoteSampleNameMap,
    noteSampleSources: {} as NoteSampleSourceMap,
  });
  const barConfigRef = useRef({
    beatsPerMeasure: 4,
    beatTypes: defaultBeatTypes(4),
    beatSubdivisions: {} as Record<string, BeatType[]>,
    barRepeats: {} as Record<number, BarRepeat>,
    loopBlocks: [] as LoopBlock[],
    barClockMode: "stopwatch" as "stopwatch" | "timer",
    barTimerDuration: 180,
    noteSamples: {} as NoteSampleMap,
    noteSampleNames: {} as NoteSampleNameMap,
    noteSampleSources: {} as NoteSampleSourceMap,
    barLoopMode: "loop" as "loop" | "once",
    blockPlayMode: "loop" as "sequential" | "loop" | "random",
    hasBeenConfigured: false,
  });

  const [progressInfo, setProgressInfo] = useState<{ beat: number; barRepeatCurrent: number; barRepeatTotal: number; blockIndex: number; blockRepeatCurrent: number; blockRepeatTotal: number; jumpCurrent?: number; jumpTotal?: number; jumpSourceBlockIndex?: number } | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dropTargetBeat, setDropTargetBeat] = useState<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const preparingCancelledRef = useRef(false);
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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showReboot, setShowReboot] = useState(false);
  const [customSoundSets, setCustomSoundSets] = useState<Record<string, CustomSoundSetConfig>>({});
  const customSoundSetsRef = useRef<Record<string, CustomSoundSetConfig>>({});
  useEffect(() => { customSoundSetsRef.current = customSoundSets; }, [customSoundSets]);

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
  const webRenderedLoopRef = useRef<{ stop: () => void } | null>(null);
  const webClickReadyRef = useRef(false);

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
  const halfTimeFlash = useSharedValue(0);

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));
  const halfTimeFlashStyle = useAnimatedStyle(() => ({
    opacity: halfTimeFlash.value,
  }));

  useEffect(() => {
    const engine = new MetronomeEngine();
    engineRef.current = engine;

    const restartPlayer = (active: any) => {
      if (Platform.OS === "web") return;
      try {
        Promise.resolve(active.seekTo(0)).then(() => {
          try { active.play(); } catch {}
        });
      } catch (e) {}
    };

    const getCustomPlayer = (role: "high" | "low" | "strong", toggle: boolean) => {
      const set = soundSetRef.current;
      const customs = customSoundSetsRef.current;
      const customCfg = customs[set];
      if (customCfg) {
        const mapping = role === "strong" ? customCfg.strong : role === "high" ? customCfg.accent : customCfg.normal;
        if (mapping.type === "custom" && mapping.sampleUri) {
          const fallbackPlayers = allPlayersRef.current.classic;
          if (role === "strong") return toggle ? fallbackPlayers.strongB : fallbackPlayers.strongA;
          if (role === "high") return toggle ? fallbackPlayers.highB : fallbackPlayers.highA;
          return toggle ? fallbackPlayers.lowB : fallbackPlayers.lowA;
        }
        const srcSet = mapping.sourceSet || "classic";
        const srcPlayers = allPlayersRef.current[srcSet] || allPlayersRef.current.classic;
        const r = mapping.sourceRole || "strong";
        if (r === "strong") return toggle ? srcPlayers.strongB : srcPlayers.strongA;
        if (r === "high") return toggle ? srcPlayers.highB : srcPlayers.highA;
        return toggle ? srcPlayers.lowB : srcPlayers.lowA;
      }
      const players = allPlayersRef.current[set as keyof typeof allPlayersRef.current] || allPlayersRef.current.classic;
      if (role === "strong") return toggle ? players.strongB : players.strongA;
      if (role === "high") return toggle ? players.highB : players.highA;
      return toggle ? players.lowB : players.lowA;
    };

    engine.setAudioCallbacks(
      () => {
        if (Platform.OS === "web" && webClickReadyRef.current) {
          playWebClick("high");
          return;
        }
        try {
          const active = getCustomPlayer("high", highToggle.current);
          highToggle.current = !highToggle.current;
          restartPlayer(active);
        } catch (e) {}
      },
      () => {
        if (Platform.OS === "web" && webClickReadyRef.current) {
          playWebClick("low");
          return;
        }
        try {
          const active = getCustomPlayer("low", lowToggle.current);
          lowToggle.current = !lowToggle.current;
          restartPlayer(active);
        } catch (e) {}
      },
      () => {
        if (Platform.OS === "web" && webClickReadyRef.current) {
          playWebClick("strong");
          return;
        }
        try {
          const active = getCustomPlayer("strong", strongToggle.current);
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

      loadCustomSoundSets().then(setCustomSoundSets);
      setIsLoaded(true);

      const set = settings.soundSet || "classic";
      const src = soundSets[set as keyof typeof soundSets] || soundSets.classic;
      Promise.all([
        loadAssetPCM(src.strong),
        loadAssetPCM(src.high),
        loadAssetPCM(src.low),
      ]).then(([strong, high, low]) => {
        clickPCMCacheRef.current[set] = { strong, high, low };
      }).catch(() => {});
    });

    Promise.all([loadNoteSamples(), loadNoteSampleNames(), loadNoteSampleSources()]).then(async ([samples, names, sources]) => {
      setNoteSamples(samples);
      noteSamplesRef.current = samples;
      setNoteSampleNames(names);
      noteSampleNamesRef.current = names;
      setNoteSampleSources(sources);
      noteSampleSourcesRef.current = sources;
      if (Object.keys(samples).length > 0) {
        await preloadSounds(samples);
      }
    }).catch(() => {});

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

      const { startMs, durationMs } = parseSampleTiming(key);
      samplePlayStateRef.current[key] = { playing: true, endTimer: null };

      try { player.pause(); } catch {}
      const startSec = startMs / 1000;
      Promise.resolve(player.seekTo(startSec)).then(() => {
        try { player.play(); } catch {}
      }).catch(() => {});

      const effectiveDur = durationMs > 0
        ? durationMs
        : player.duration > 0
          ? (player.duration - startSec) * 1000
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
    };

    engine.setCustomSampleCallback((beat: number, subBeat: number) => {
      if (!barModeRef.current) return false;
      const key = `${beat}-${subBeat}`;
      const player = noteSampleSoundsRef.current[key];
      if (player) {
        if (samplePlayStateRef.current[key]?.playing) return true;
        setTimeout(() => playSampleAsync(key, player), 0);
        return true;
      }
      return false;
    });

    loadLoggingEnabled().then((val) => setLoggingEnabled(val));
    AsyncStorage.getItem("metronome_onboarding_done").then(async (val) => {
      if (!val) {
        const [existingSettings, existingTheme] = await Promise.all([
          AsyncStorage.getItem("metronome_settings"),
          AsyncStorage.getItem("metronome_theme_color"),
        ]);
        if (existingSettings || existingTheme) {
          AsyncStorage.setItem("metronome_onboarding_done", "1");
        } else {
          setShowOnboarding(true);
        }
      }
    });
    setupNotificationControls();

    setTimeout(() => {
      warmupAudioPlayers().catch(() => {});
    }, 500);

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
    for (const [key, player] of Object.entries(noteSampleSoundsRef.current)) {
      try { player.pause(); } catch {}
      const uri = noteSamplesRef.current[key] || "";
      const hashParts = uri.split("#t=")[1];
      let startSec = 0;
      if (hashParts) {
        const parts = hashParts.split(",").map(Number);
        if (!isNaN(parts[0])) startSec = parts[0] / 1000;
      }
      try { player.seekTo(startSec); } catch {}
    }
  }, []);

  const trimPCM = useCallback((decoded: DecodedSample, durationSec: number): DecodedSample => {
    const maxSamples = Math.floor(durationSec * 44100);
    if (decoded.pcm.length <= maxSamples) return decoded;
    const trimmed = decoded.pcm.slice(0, maxSamples);
    const fadeLen = Math.min(Math.floor(0.01 * 44100), trimmed.length);
    for (let i = 0; i < fadeLen; i++) {
      trimmed[trimmed.length - fadeLen + i] *= (fadeLen - i) / fadeLen;
    }
    return { pcm: trimmed, trimStartSamples: decoded.trimStartSamples, trimLenSamples: Math.min(decoded.trimLenSamples, maxSamples) };
  }, []);

  const getClickPCMs = useCallback(async (set: SoundSet): Promise<ClickPCMs> => {
    if (clickPCMCacheRef.current[set]) return clickPCMCacheRef.current[set];

    const customCfg = customSoundSetsRef.current[set];
    if (customCfg) {
      const loadSample = async (cfg: CustomSoundSample) => {
        if (cfg.type === "custom" && cfg.sampleUri) {
          try {
            const pcm = await decodeSampleFile(cfg.sampleUri);
            if (pcm) {
              const trimmed = trimPCM({ pcm, trimStartSamples: 0, trimLenSamples: pcm.length }, cfg.duration);
              return trimmed.pcm;
            }
            console.warn("[CustomSound] Decode returned null for:", cfg.sampleUri);
          } catch (e) {
            console.warn("[CustomSound] Failed to decode custom sample:", e);
          }
        }
        const srcSet = cfg.sourceSet || "classic";
        const srcRole = cfg.sourceRole || "strong";
        const src = soundSets[srcSet];
        const asset = srcRole === "strong" ? src.strong : srcRole === "high" ? src.high : src.low;
        const raw = await loadAssetPCM(asset);
        const trimmed = trimPCM({ pcm: raw, trimStartSamples: 0, trimLenSamples: raw.length }, cfg.duration);
        return trimmed.pcm;
      };
      const [strong, high, low] = await Promise.all([
        loadSample(customCfg.strong),
        loadSample(customCfg.accent),
        loadSample(customCfg.normal),
      ]);
      const result: ClickPCMs = { strong, high, low };
      clickPCMCacheRef.current[set] = result;
      return result;
    }

    const src = soundSets[set as keyof typeof soundSets] || soundSets.classic;
    const [strong, high, low] = await Promise.all([
      loadAssetPCM(src.strong),
      loadAssetPCM(src.high),
      loadAssetPCM(src.low),
    ]);
    const result: ClickPCMs = { strong, high, low };
    clickPCMCacheRef.current[set] = result;
    return result;
  }, [trimPCM]);

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

      await new Promise(r => setTimeout(r, 0));

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
  }, [getClickPCMs, getSamplePCMs]);

  const warmupAudioPlayers = useCallback(async () => {
    try {
      const set = soundSetRef.current;
      const customCfg = customSoundSetsRef.current[set];
      const builtinSet = customCfg ? customCfg.strong.sourceSet : (set as keyof typeof soundSets);
      const players = allPlayersRef.current[builtinSet] || allPlayersRef.current.classic;
      const toWarm = [players.highA, players.highB, players.lowA, players.lowB, players.strongA, players.strongB];
      const savedVolumes = toWarm.map(p => p.volume);
      toWarm.forEach(p => { p.volume = 0; });
      await Promise.all(toWarm.map(async (p) => {
        try { await p.seekTo(0); p.play(); } catch {}
      }));
      await new Promise(r => setTimeout(r, 50));
      await Promise.all(toWarm.map(async (p, i) => {
        try { p.pause(); await p.seekTo(0); p.volume = savedVolumes[i]; } catch {}
      }));
    } catch {}
  }, []);

  const stopRenderedAudio = useCallback(() => {
    if (webRenderedLoopRef.current) {
      webRenderedLoopRef.current.stop();
      webRenderedLoopRef.current = null;
    }
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

    let rafPending = false;
    let pendingBeat = -1;
    let pendingAccent = false;
    let pendingSubBeat = -1;
    let pendingProgress: typeof progressInfo = null;
    let hasBeatUpdate = false;
    let hasSubBeatUpdate = false;
    let hasProgressUpdate = false;

    const flushUpdates = () => {
      rafPending = false;
      if (hasBeatUpdate) {
        hasBeatUpdate = false;
        setCurrentBeat(pendingBeat);
        const fm = flashModeRef.current;
        const shouldFlash = fm === "all" || (fm === "accent" && pendingAccent);
        if (shouldFlash) {
          flashOpacity.value = withSequence(
            withTiming(0.12, { duration: 50 }),
            withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) })
          );
        }
      }
      if (hasSubBeatUpdate) {
        hasSubBeatUpdate = false;
        setActiveSubNote(pendingSubBeat);
      }
      if (hasProgressUpdate) {
        hasProgressUpdate = false;
        setProgressInfo(pendingProgress);
      }
    };

    const scheduleFlush = () => {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(flushUpdates);
      }
    };

    engine.setOnBeat((beat: number, isAccent: boolean) => {
      pendingBeat = beat;
      pendingAccent = isAccent;
      hasBeatUpdate = true;
      scheduleFlush();
    });

    engine.setOnSubBeat((_beat: number, subBeat: number) => {
      activeSubNoteRef.current = subBeat;
      pendingSubBeat = subBeat;
      hasSubBeatUpdate = true;
      scheduleFlush();
    });

    engine.setOnProgress((info) => {
      pendingProgress = info;
      hasProgressUpdate = true;
      scheduleFlush();
    });

    engine.setOnScheduleRebuild(() => {
      if (renderedPlayerRef.current) {
        try {
          renderedPlayerRef.current.pause();
          renderedPlayerRef.current.release();
        } catch {}
        renderedPlayerRef.current = null;
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

  const handleOnboardingComplete = useCallback(async (result: OnboardingResult) => {
    setShowOnboarding(false);
    AsyncStorage.setItem("metronome_onboarding_done", "1");

    setThemeColor(result.themeColor);
    persistSettings({ flashMode: result.flashMode, hapticMode: result.hapticMode });
    setFlashMode(result.flashMode);
    flashModeRef.current = result.flashMode;
    setHapticMode(result.hapticMode);
    engineRef.current?.setHapticMode(result.hapticMode);
    setLoggingEnabled(result.loggingEnabled);
    saveLoggingEnabled(result.loggingEnabled);

    if (result.username) {
      setUsername(result.username);
      persistSettings({ username: result.username });
    }

    if (result.practiceRoomName) {
      try {
        const { requestLocationPermission, addPracticeRoom } = await import("@/lib/practice-room");
        const granted = await requestLocationPermission();
        if (granted) {
          await addPracticeRoom(result.practiceRoomName);
        }
      } catch (e) {
        console.warn("Failed to register practice room:", e);
      }
    }
  }, [setThemeColor, persistSettings]);

  const handleResetApp = useCallback(async () => {
    try {
      const engine = engineRef.current;
      if (engine?.isRunning) {
        engine.stop();
      }
      await AsyncStorage.clear();

      setShowSettings(false);
      setShowMenu(false);
      setShowSignalGen(false);
      setShowPracticeBook(false);
      setShowWorkUp(false);

      setBpm(120);
      setBeatsPerMeasure(4);
      setBeatTypes(defaultBeatTypes(4));
      setSubdivisionPattern(["accent"]);
      setBeatSubdivisions({});
      setBarMode(false);
      setBarStartBeat(null);
      setBarLoopMode("loop");
      setBarRepeats({});
      setLoopBlocks([]);
      barModeRef.current = false;
      dialConfigRef.current = {
        beatsPerMeasure: 4,
        beatTypes: defaultBeatTypes(4),
        beatSubdivisions: {},
        noteSamples: {},
        noteSampleNames: {},
        noteSampleSources: {},
      };
      barConfigRef.current = {
        beatsPerMeasure: 4,
        beatTypes: defaultBeatTypes(4),
        beatSubdivisions: {},
        barRepeats: {},
        loopBlocks: [],
        barClockMode: "stopwatch",
        barTimerDuration: 180,
        noteSamples: {},
        noteSampleNames: {},
        noteSampleSources: {},
        barLoopMode: "loop",
        blockPlayMode: "loop",
        hasBeenConfigured: false,
      };

      setVolume(0.5);
      setSampleVolume(0.8);
      sampleVolumeRef.current = 0.8;
      setBackgroundPlay(false);
      setSoundSet("classic");
      setFlashMode("accent");
      flashModeRef.current = "accent";
      setHapticMode("all");
      setAudioOffsetMs(0);
      setTimerStopMode("end-of-cycle");
      setUsername("");
      setLoggingEnabled(false);
      setRoomTrackingActive(false);
      setTrackingRoomName(null);
      setProgressInfo(null);
      setNoteSamples({});
      setNoteSampleNames({});
      setNoteSampleSources({});
      noteSamplesRef.current = {};
      noteSampleNamesRef.current = {};
      noteSampleSourcesRef.current = {};
      loadedPracticeNoteRef.current = null;

      if (engine) {
        engine.setBpm(120);
        engine.setBeatsPerMeasure(4);
        engine.setHapticMode("all");
        engine.setAudioOffsetMs(0);
        engine.setBeatTypes(defaultBeatTypes(4));
        engine.setAllBeatSubdivisions({});
        engine.setAllBarRepeats({});
      }

      setThemeColor("gold");
      setShowReboot(true);
      setTimeout(() => {
        setShowReboot(false);
        setShowOnboarding(true);
      }, 800);
    } catch (e) {
      console.warn("Reset failed:", e);
    }
  }, [setThemeColor]);

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

  const toggleHalfTime = useCallback(() => {
    setHalfTime((prev) => {
      const next = !prev;
      engineRef.current?.setHalfTime(next);
      halfTimeFlash.value = withSequence(
        withTiming(next ? 0.25 : 0.15, { duration: 80 }),
        withTiming(0, { duration: 600, easing: Easing.out(Easing.quad) })
      );
      return next;
    });
  }, []);

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
  const blockPlayModeRef = useRef(blockPlayMode);
  useEffect(() => { blockPlayModeRef.current = blockPlayMode; }, [blockPlayMode]);

  const togglePlayPause = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    if (isPreparing && !isPlaying) {
      preparingCancelledRef.current = true;
      setIsPreparing(false);
      return;
    }

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    const modeLabel = barModeRef.current ? "Bar" : "Dial";
    if (isPlaying) {
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPreparing(false);
      setIsPlaying(false);
      setCurrentBeat(-1);
      setMeasureCount(0);
      setActiveSubNote(-1);
      setProgressInfo(null);
      showPausedNotification(bpm, modeLabel, languageRef.current);
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
      setCurrentBeat(-1);
      setMeasureCount(0);
      setActiveSubNote(-1);
      activeSubNoteRef.current = -1;
      setProgressInfo(null);
      clearSamplePlayStates();

      const startBeat = barModeRef.current ? barStartBeatRef.current : undefined;
      showPlayingNotification(bpm, modeLabel, languageRef.current);
      if (loggingEnabled) {
        practiceStartRef.current = Date.now();
      }

      if (barModeRef.current) {
        engine.setBeatTypes([...(barConfigRef.current.beatTypes || [])]);
        engine.setAllBeatSubdivisions(barConfigRef.current.beatSubdivisions || {});
        engine.setAllBarRepeats(barConfigRef.current.barRepeats || {});
        engine.setLoopBlocks(barConfigRef.current.loopBlocks || []);
        engine.setBlockPlayMode(blockPlayModeRef.current);
        const bpmOverrides: Record<number, number> = {};
        for (const [k, v] of Object.entries(barConfigRef.current.barRepeats || {})) {
          if (v.bpm) bpmOverrides[Number(k)] = v.bpm;
        }
        engine.setAllBarBpmOverrides(bpmOverrides);
      } else {
        engine.setBeatTypes([...(dialConfigRef.current.beatTypes || [])]);
        engine.setAllBeatSubdivisions(dialConfigRef.current.beatSubdivisions || {});
      }
      engine.buildScheduleOnly();

      preparingCancelledRef.current = false;
      setIsPreparing(true);

      try {
        const renderedPlayer = await buildRenderedPlayer();
        if (preparingCancelledRef.current) {
          if (renderedPlayer) { try { renderedPlayer.release(); } catch {} }
          setIsPreparing(false);
          return;
        }
        setIsPreparing(false);

        if (renderedPlayer) {
          stopRenderedAudio();
          renderedPlayerRef.current = renderedPlayer;
          renderedPlayer.volume = 1.0;
          engine.setPreRenderedAudio(true);
        } else {
          engine.setPreRenderedAudio(false);
        }

        setIsPlaying(true);
        engine.start(startBeat ?? undefined);

        if (renderedPlayer) {
          renderedPlayer.play();
        }

        if (barModeRef.current && barLoopModeRef.current === "once") {
          engine.requestStopAfterMeasure();
        }
      } catch {
        setIsPreparing(false);
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
          updateNotificationBpm(newBpm, modeLabel, true, languageRef.current);
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
            updateNotificationBpm(newBpm, modeLabel, true, languageRef.current);
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
      setIsPreparing(false);
      setIsPlaying(false);
      setCurrentBeat(-1);
      setMeasureCount(0);
      setActiveSubNote(-1);
      setProgressInfo(null);
    }
    setBarStartBeat(null);

    if (toBarMode) {
      dialConfigRef.current = {
        beatsPerMeasure,
        beatTypes: [...beatTypes],
        beatSubdivisions: { ...beatSubdivisions },
        noteSamples: { ...noteSamples },
        noteSampleNames: { ...noteSampleNames },
        noteSampleSources: { ...noteSampleSources },
      };

      const bc = barConfigRef.current;
      if (bc.hasBeenConfigured) {
        setBeatsPerMeasure(bc.beatsPerMeasure);
        setBeatTypes([...bc.beatTypes]);
        setBeatSubdivisions({ ...bc.beatSubdivisions });
        setBarRepeats({ ...bc.barRepeats });
        setLoopBlocks([...bc.loopBlocks]);
        setBarLoopMode(bc.barLoopMode);
        setBlockPlayMode((bc as any).blockPlayMode || "loop");
        setNoteSamples({ ...bc.noteSamples });
        noteSamplesRef.current = { ...bc.noteSamples };
        setNoteSampleNames({ ...bc.noteSampleNames });
        noteSampleNamesRef.current = { ...bc.noteSampleNames };
        setNoteSampleSources({ ...bc.noteSampleSources });
        noteSampleSourcesRef.current = { ...bc.noteSampleSources };
        engine.setBeatsPerMeasure(bc.beatsPerMeasure);
        engine.setBeatTypes([...bc.beatTypes]);
        engine.setAllBeatSubdivisions(bc.beatSubdivisions);
        engine.setAllBarRepeats(bc.barRepeats);
        engine.setLoopBlocks(bc.loopBlocks);
        engine.setBlockPlayMode((bc as any).blockPlayMode || "loop");
        for (const [k, v] of Object.entries(bc.barRepeats)) {
          if (v.bpm) engine.setBarBpmOverride(Number(k), v.bpm);
        }
      } else {
        const defaultBeats = 4;
        const defaultTypes = defaultBeatTypes(defaultBeats);
        barConfigRef.current = {
          ...bc,
          beatsPerMeasure: defaultBeats,
          beatTypes: [...defaultTypes],
          beatSubdivisions: {},
          barRepeats: {},
          loopBlocks: [],
          barClockMode: "stopwatch",
          barTimerDuration: 180,
          noteSamples: {},
          noteSampleNames: {},
          noteSampleSources: {},
          barLoopMode: "loop",
          blockPlayMode: "loop",
          hasBeenConfigured: true,
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
      }
    } else {
      barConfigRef.current = {
        ...barConfigRef.current,
        beatsPerMeasure,
        beatTypes: [...beatTypes],
        beatSubdivisions: { ...beatSubdivisions },
        barRepeats: { ...barRepeats },
        loopBlocks: [...loopBlocks],
        noteSamples: { ...noteSamples },
        noteSampleNames: { ...noteSampleNames },
        noteSampleSources: { ...noteSampleSources },
        barLoopMode,
        blockPlayMode,
        hasBeenConfigured: true,
      };
      const dc = dialConfigRef.current;
      setBeatsPerMeasure(dc.beatsPerMeasure);
      setBeatTypes([...dc.beatTypes]);
      setBeatSubdivisions({ ...dc.beatSubdivisions });
      setBarRepeats({});
      setLoopBlocks([]);
      setNoteSamples({ ...dc.noteSamples });
      noteSamplesRef.current = { ...dc.noteSamples };
      setNoteSampleNames({ ...dc.noteSampleNames });
      noteSampleNamesRef.current = { ...dc.noteSampleNames };
      setNoteSampleSources({ ...dc.noteSampleSources });
      noteSampleSourcesRef.current = { ...dc.noteSampleSources };
      engine.setBeatsPerMeasure(dc.beatsPerMeasure);
      engine.setBeatTypes([...dc.beatTypes]);
      engine.setAllBeatSubdivisions(dc.beatSubdivisions);
      engine.clearLoopBlocks();
      engine.clearBarRepeats();
    }

    setBarMode(toBarMode);
  }, [isPlaying, beatsPerMeasure, beatTypes, beatSubdivisions, barRepeats, loopBlocks, barLoopMode, noteSamples, noteSampleNames, noteSampleSources]);

  const startMetronome = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || isPlaying || isPreparing) return;

    setCurrentBeat(-1);
    setMeasureCount(0);
    setActiveSubNote(-1);
    activeSubNoteRef.current = -1;
    setProgressInfo(null);
    clearSamplePlayStates();

    if (barModeRef.current) {
      engine.setBeatTypes([...(barConfigRef.current.beatTypes || [])]);
      engine.setAllBeatSubdivisions(barConfigRef.current.beatSubdivisions || {});
      engine.setAllBarRepeats(barConfigRef.current.barRepeats || {});
      engine.setLoopBlocks(barConfigRef.current.loopBlocks || []);
      engine.setBlockPlayMode(blockPlayModeRef.current);
      const bpmOv: Record<number, number> = {};
      for (const [k, v] of Object.entries(barConfigRef.current.barRepeats || {})) {
        if (v.bpm) bpmOv[Number(k)] = v.bpm;
      }
      engine.setAllBarBpmOverrides(bpmOv);
    } else {
      engine.setBeatTypes([...(dialConfigRef.current.beatTypes || [])]);
      engine.setAllBeatSubdivisions(dialConfigRef.current.beatSubdivisions || {});
    }
    engine.buildScheduleOnly();

    preparingCancelledRef.current = false;
    setIsPreparing(true);

    try {
      if (Platform.OS === "web") {
        const src = soundSets[soundSetRef.current as keyof typeof soundSets] || soundSets.classic;
        await ensureWebClickBuffers(src as any);
        webClickReadyRef.current = true;

        const ctx = getWebAudioContext();
        if (ctx && ctx.state === "suspended") {
          await ctx.resume();
        }

        if (preparingCancelledRef.current) {
          setIsPreparing(false);
          return;
        }
        setIsPreparing(false);

        if (webRenderedLoopRef.current) {
          webRenderedLoopRef.current.stop();
          webRenderedLoopRef.current = null;
        }

        try {
          const scheduleInfo = engine.getScheduleInfo();
          const clickPCMs = await getClickPCMs(soundSetRef.current);
          const pcm = renderMeasure({
            schedule: scheduleInfo.ticks as TickInfo[],
            measureDurationMs: scheduleInfo.durationMs,
            clickPCMs,
            samplePCMs: new Map(),
            clickVolume: 1.0,
            sampleVolume: 0,
          });
          const loop = playWebRenderedLoop(pcm);
          webRenderedLoopRef.current = loop;
          engine.setPreRenderedAudio(true);
        } catch (renderErr) {
          console.warn("[startMetronome] Web pre-render failed, using per-tick:", renderErr);
          engine.setPreRenderedAudio(false);
        }

        setIsPlaying(true);
        engine.start();
      } else {
        const renderedPlayer = await buildRenderedPlayer();
        if (preparingCancelledRef.current) {
          if (renderedPlayer) { try { renderedPlayer.release(); } catch {} }
          setIsPreparing(false);
          return;
        }
        setIsPreparing(false);

        if (renderedPlayer) {
          stopRenderedAudio();
          renderedPlayerRef.current = renderedPlayer;
          renderedPlayer.volume = 1.0;
          engine.setPreRenderedAudio(true);
        } else {
          engine.setPreRenderedAudio(false);
        }

        setIsPlaying(true);
        engine.start();

        if (renderedPlayer) {
          renderedPlayer.play();
        }
      }
    } catch (e) {
      console.warn("[startMetronome] Error:", e);
      setIsPreparing(false);
    }
  }, [isPlaying, isPreparing, buildRenderedPlayer, stopRenderedAudio, getClickPCMs]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setOnMeasureComplete(() => {
      setMeasureCount(c => c + 1);
      if (!engine.getIsRunning()) {
        if (webRenderedLoopRef.current) {
          webRenderedLoopRef.current.stop();
          webRenderedLoopRef.current = null;
        }
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
        setIsPreparing(false);
        setIsPlaying(false);
        setCurrentBeat(-1);
        setMeasureCount(0);
        setActiveSubNote(-1);
        setProgressInfo(null);
        const modeLabel = barModeRef.current ? "Bar" : "Dial";
        showPausedNotification(bpmRef.current, modeLabel, languageRef.current);
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
      setIsPreparing(false);
      setIsPlaying(false);
      setCurrentBeat(-1);
      setMeasureCount(0);
      setProgressInfo(null);
      const modeLabel = barModeRef.current ? "Bar" : "Dial";
      showPausedNotification(bpmRef.current, modeLabel, languageRef.current);
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

      if (closestDist < 55) return closestBeat;
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
      if (barModeRef.current) {
        barConfigRef.current.beatSubdivisions = newSubs;
      } else {
        dialConfigRef.current.beatSubdivisions = newSubs;
      }
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
        if (barModeRef.current) {
          barConfigRef.current.beatSubdivisions = { ...newSubs };
        } else {
          dialConfigRef.current.beatSubdivisions = { ...newSubs };
        }
        persistSettings({ beatSubdivisions: newSubs });
      } else if (target !== null && subdivisionPattern.length <= 1) {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        const newSubs = { ...beatSubdivisions };
        delete newSubs[String(target)];
        setBeatSubdivisions(newSubs);
        engineRef.current?.setBeatSubdivision(target, null);
        if (barModeRef.current) {
          barConfigRef.current.beatSubdivisions = { ...newSubs };
        } else {
          dialConfigRef.current.beatSubdivisions = { ...newSubs };
        }
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
      engineRef.current?.setBarBpmOverride(beat, repeat?.bpm ?? null);
      return next;
    });
  }, []);

  const handleLoopBlocksChange = useCallback((blocks: LoopBlock[]) => {
    setLoopBlocks(blocks);
    engineRef.current?.setLoopBlocks(blocks);
    barConfigRef.current.loopBlocks = [...blocks];
  }, []);

  const fullScreenResetFlash = useSharedValue(0);
  const fullScreenResetFlashStyle = useAnimatedStyle(() => ({
    opacity: fullScreenResetFlash.value * 0.5,
  }));

  const handleBarQuickSave = useCallback(async (): Promise<boolean> => {
    try {
      const { loadPracticeBook: lpb, savePracticeBook: spb, createPracticeEntry } = await import("@/lib/storage");
      const config = {
        mode: "bar" as const,
        bpm,
        beatsPerMeasure,
        beatTypes: [...beatTypes],
        beatSubdivisions: { ...beatSubdivisions },
        barRepeats: { ...barRepeats },
        loopBlocks: [...loopBlocks],
        barLoopMode: barLoopMode as "loop" | "once",
        blockPlayMode: blockPlayMode as "sequential" | "loop" | "random",
        subdivisionPattern: [...subdivisionPattern],
        barClockMode: barConfigRef.current.barClockMode,
        barTimerDuration: barConfigRef.current.barTimerDuration,
      };
      const now = new Date();
      const label = `Bar ${beatsPerMeasure}/${bpm} ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
      const entry = createPracticeEntry(label, config, username);
      const existing = await lpb();
      await spb([entry, ...existing]);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    } catch (e) {
      console.warn("Quick save error:", e);
      return false;
    }
  }, [bpm, beatsPerMeasure, beatTypes, beatSubdivisions, barRepeats, loopBlocks, barLoopMode, blockPlayMode, subdivisionPattern, username, t]);

  const handleResetFlash = useCallback(() => {
    fullScreenResetFlash.value = withSequence(
      withTiming(1, { duration: 80 }),
      withTiming(0, { duration: 500, easing: Easing.out(Easing.quad) })
    );
  }, []);

  const handleBarReset = useCallback(() => {
    const engine = engineRef.current;
    const beats = barConfigRef.current.beatsPerMeasure || 4;
    const newTypes = defaultBeatTypes(beats);
    setBeatTypes(newTypes);
    setBeatSubdivisions({});
    setBarRepeats({});
    setLoopBlocks([]);
    setBarStartBeat(null);
    setBarLoopMode("loop");
    setNoteSamples({});
    noteSamplesRef.current = {};
    setNoteSampleNames({});
    noteSampleNamesRef.current = {};
    setNoteSampleSources({});
    noteSampleSourcesRef.current = {};
    for (const [k, st] of Object.entries(samplePlayStateRef.current)) {
      if (st.endTimer) clearTimeout(st.endTimer);
    }
    samplePlayStateRef.current = {};
    for (const player of Object.values(noteSampleSoundsRef.current)) {
      try { player.pause(); } catch {}
      try { player.release(); } catch {}
    }
    noteSampleSoundsRef.current = {};
    saveNoteSamples({});
    saveNoteSampleNames({});
    saveNoteSampleSources({});
    barConfigRef.current = {
      beatsPerMeasure: beats,
      beatTypes: [...newTypes],
      beatSubdivisions: {},
      barRepeats: {},
      loopBlocks: [],
      barClockMode: "stopwatch",
      barTimerDuration: 180,
      noteSamples: {},
      noteSampleNames: {},
      noteSampleSources: {},
      barLoopMode: "loop",
      blockPlayMode: "loop",
      hasBeenConfigured: true,
    };
    if (engine) {
      engine.setBeatTypes([...newTypes]);
      engine.setAllBeatSubdivisions({});
      engine.setAllBarRepeats({});
      engine.clearLoopBlocks();
      engine.setAllBarBpmOverrides({});
    }
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
    if (barMode) {
      return {
        mode: "bar" as const,
        bpm,
        beatsPerMeasure,
        beatTypes: [...beatTypes],
        beatSubdivisions: { ...beatSubdivisions },
        barRepeats: { ...barRepeats },
        loopBlocks: [...loopBlocks],
        barLoopMode: barLoopMode as "loop" | "once",
        blockPlayMode: blockPlayMode as "sequential" | "loop" | "random",
        subdivisionPattern: [...subdivisionPattern],
        barClockMode: barConfigRef.current.barClockMode,
        barTimerDuration: barConfigRef.current.barTimerDuration,
      };
    }
    const dc = dialConfigRef.current;
    return {
      mode: "beat" as const,
      bpm,
      beatsPerMeasure: dc.beatsPerMeasure,
      beatTypes: [...dc.beatTypes],
      beatSubdivisions: { ...dc.beatSubdivisions },
      barRepeats: {} as Record<number, any>,
      loopBlocks: [] as any[],
      barLoopMode: "loop" as const,
      blockPlayMode: "loop" as const,
      subdivisionPattern: [...subdivisionPattern],
    };
  }, [barMode, bpm, beatsPerMeasure, beatTypes, beatSubdivisions, barRepeats, loopBlocks, barLoopMode, blockPlayMode, subdivisionPattern]);

  const handleLoadPracticeEntry = useCallback((entry: PracticeEntry) => {
    const engine = engineRef.current;
    if (!engine) return;

    if (isPlaying) {
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPreparing(false);
      setIsPlaying(false);
      setCurrentBeat(-1);
      setMeasureCount(0);
      setActiveSubNote(-1);
      setProgressInfo(null);
    }

    const entryMode = entry.mode || "bar";
    const isBeatEntry = entryMode === "beat";

    if (isBeatEntry) {
      if (barMode) {
        barConfigRef.current = {
          ...barConfigRef.current,
          beatsPerMeasure,
          beatTypes: [...beatTypes],
          beatSubdivisions: { ...beatSubdivisions },
          barRepeats: { ...barRepeats },
          loopBlocks: [...loopBlocks],
          noteSamples: { ...noteSamples },
          noteSampleNames: { ...noteSampleNames },
          noteSampleSources: { ...noteSampleSources },
          hasBeenConfigured: true,
        };
        setBarMode(false);
      }

      dialConfigRef.current = {
        ...dialConfigRef.current,
        beatsPerMeasure: entry.beatsPerMeasure,
        beatTypes: [...entry.beatTypes],
        beatSubdivisions: { ...entry.beatSubdivisions },
      };

      setBpm(entry.bpm);
      setBeatsPerMeasure(entry.beatsPerMeasure);
      setBeatTypes([...entry.beatTypes]);
      setBeatSubdivisions({ ...entry.beatSubdivisions });
      if (entry.subdivisionPattern) setSubdivisionPattern([...entry.subdivisionPattern]);

      engine.setBpm(entry.bpm);
      engine.setBeatsPerMeasure(entry.beatsPerMeasure);
      engine.setBeatTypes([...entry.beatTypes]);
      engine.setAllBeatSubdivisions(entry.beatSubdivisions);
    } else {
      if (!barMode) {
        dialConfigRef.current = {
          ...dialConfigRef.current,
          beatsPerMeasure,
          beatTypes: [...beatTypes],
          beatSubdivisions: { ...beatSubdivisions },
          noteSamples: { ...noteSamples },
          noteSampleNames: { ...noteSampleNames },
          noteSampleSources: { ...noteSampleSources },
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
      setBlockPlayMode((entry as any).blockPlayMode || "loop");
      setSubdivisionPattern([...entry.subdivisionPattern]);

      engine.setBpm(entry.bpm);
      engine.setBeatsPerMeasure(entry.beatsPerMeasure);
      engine.setBeatTypes([...entry.beatTypes]);
      engine.setAllBeatSubdivisions(entry.beatSubdivisions);
      engine.setLoopBlocks(entryBlocks);
      engine.setBlockPlayMode((entry as any).blockPlayMode || "loop");
      engine.setAllBarRepeats(entry.barRepeats || {});
      const bpmOverridesEntry: Record<number, number> = {};
      for (const [k, v] of Object.entries(entry.barRepeats || {})) {
        if (v.bpm) bpmOverridesEntry[Number(k)] = v.bpm;
      }
      engine.setAllBarBpmOverrides(bpmOverridesEntry);
      barConfigRef.current = {
        ...barConfigRef.current,
        beatsPerMeasure: entry.beatsPerMeasure,
        beatTypes: [...entry.beatTypes],
        beatSubdivisions: { ...entry.beatSubdivisions },
        barRepeats: { ...entry.barRepeats },
        loopBlocks: [...entryBlocks],
        barClockMode: entry.barClockMode || "stopwatch",
        barTimerDuration: entry.barTimerDuration ?? 180,
        hasBeenConfigured: true,
      };
    }

    loadedPracticeNoteRef.current = { id: entry.id, label: entry.label };
  }, [isPlaying, barMode, beatsPerMeasure, beatTypes, beatSubdivisions, barRepeats, loopBlocks, noteSamples, noteSampleNames, noteSampleSources]);

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
            t("main", "importSettings"),
            `"${entry.label}" ${t("main", "importConfirm")}\n\nBPM: ${entry.bpm} | ${entry.beatsPerMeasure} beats`,
            [
              { text: t("main", "cancel"), style: "cancel" },
              {
                text: t("main", "apply"),
                onPress: () => handleLoadPracticeEntry(entry),
              },
              {
                text: t("main", "saveAndApply"),
                onPress: async () => {
                  const { loadPracticeBook: lpb, savePracticeBook: spb } = await import("@/lib/storage");
                  const existing = await lpb();
                  await spb([entry, ...existing]);
                  handleLoadPracticeEntry(entry);
                  Alert.alert(t("main", "saved"), `"${entry.label}" ${t("main", "savedToNote")}`);
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
        Alert.alert(t("main", "importComplete"), `"${entry.label}" ${t("main", "savedToNote")}\n\nBPM: ${entry.bpm} | ${entry.beatsPerMeasure} beats`);
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
      Alert.alert(t("main", "goalEdited"), `"${entry.label}" ${t("main", "goalEditedMsg")}`);
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
    Alert.alert(t("main", "goalSet"), `"${entry.label}" ${t("main", "goalSetMsg")} (${targetMinutes}${t("duration", "m")})`);
  }, []);

  const tempoLabel = getTempoLabelI18n(bpm, language);

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

      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: halfTime ? C.accent : Colors.text,
            pointerEvents: "none" as const,
            zIndex: 9999,
          },
          halfTimeFlashStyle,
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

      <OnboardingModal
        visible={showOnboarding}
        onComplete={handleOnboardingComplete}
      />

      <Animated.View
        pointerEvents="none"
        style={[{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: Colors.danger,
          zIndex: 9998,
        }, fullScreenResetFlashStyle]}
      />

      {showReboot && (
        <View style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#0D1117",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 9999,
        }}>
          <Ionicons name="refresh" size={36} color="#D4A846" />
          <Text style={{
            color: "#8B949E",
            fontSize: 14,
            marginTop: 12,
            fontFamily: "SpaceGrotesk_400Regular",
          }}>Rebooting...</Text>
        </View>
      )}

      <WorkUpOverviewModal
        visible={showWorkUp}
        onClose={() => setShowWorkUp(false)}
        loggingEnabled={loggingEnabled}
        roomTrackingActive={roomTrackingActive}
        trackingRoomName={trackingRoomName}
        onStartRoomTracking={startRoomTracking}
        onStopRoomTracking={stopRoomTracking}
        username={username}
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
        onResetApp={handleResetApp}
        customSoundSets={customSoundSets}
        onCustomSoundSetsChange={(configs) => {
          setCustomSoundSets(configs);
          for (const key of Object.keys(clickPCMCacheRef.current)) {
            if (key.startsWith("custom")) delete clickPCMCacheRef.current[key];
          }
        }}
      />

      {completedGoalPopups.length > 0 && !showMenu && !showSignalGen && !showPracticeBook && !showWorkUp && !showSettings && (
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
            blockPlayMode={blockPlayMode}
            onBlockPlayModeChange={setBlockPlayMode}
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
            progressInfo={progressInfo}
            measureCount={measureCount}
            onBarReset={handleBarReset}
            onBarQuickSave={handleBarQuickSave}
            onResetFlash={handleResetFlash}
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
            halfTime={halfTime}
            onHalfTimeToggle={toggleHalfTime}
          />
        </View>
      </View>

      {!barMode && (
        <StopwatchTimer
          onTimerExpired={handleTimerExpired}
          onStopRequested={handleTimerExpired}
          onStartMetronome={startMetronome}
          isMetronomePlaying={isPlaying}
          currentBeat={currentBeat}
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
