import { useRef, useCallback } from "react";
import {
  applyEntryToEngine as applyEntryToEngineCore,
  entryToBarConfig,
  migrateLayerBlocks,
} from "@/app/index.helpers";
import type { BarConfig, DialConfig } from "@/app/index.helpers";
import { loadPracticeBook } from "@/lib/storage";
import type { PracticeEntry } from "@/lib/storage";
import type { BeatType, MetronomeEngine } from "@/lib/metronome-engine";
import { toEngineBpm } from "@/lib/metronome-engine";
import type { BarRepeat, LoopBlock } from "@/components/BeatIndicator";
import {
  saveNoteSamples,
  saveNoteSampleNames,
  saveNoteSampleSources,
  saveNoteSampleChannels,
  saveNoteSampleVolumes,
  saveNoteSampleSpeeds,
} from "@/lib/note-samples";
import type {
  NoteSampleMap,
  NoteSampleNameMap,
  NoteSampleSourceMap,
  NoteSampleChannelMap,
  NoteSampleVolumeMap,
  NoteSampleSpeedMap,
} from "@/lib/note-samples";

// ─────────────────────────────────────────────────────────────────────────────
// Parameter interface
// ─────────────────────────────────────────────────────────────────────────────

export interface UsePracticeBookLoadParams {
  // Engine
  engineRef: React.MutableRefObject<MetronomeEngine | null>;

  // Stable mutable refs
  barModeRef: React.MutableRefObject<boolean>;
  noteModeRef: React.MutableRefObject<boolean>;
  barConfigRef: React.MutableRefObject<BarConfig>;
  barBpmRef?: React.MutableRefObject<number>;
  dialConfigRef: React.MutableRefObject<DialConfig>;
  beatDenominatorRef: React.MutableRefObject<2 | 4 | 8>;
  noteSamplesRef: React.MutableRefObject<NoteSampleMap>;
  noteSampleNamesRef: React.MutableRefObject<NoteSampleNameMap>;
  noteSampleSourcesRef: React.MutableRefObject<NoteSampleSourceMap>;
  noteSampleChannelsRef: React.MutableRefObject<NoteSampleChannelMap>;
  noteSampleVolumesRef: React.MutableRefObject<NoteSampleVolumeMap>;
  noteSampleSpeedsRef: React.MutableRefObject<NoteSampleSpeedMap>;
  noteQueueRef: React.MutableRefObject<PracticeEntry[]>;
  notePlayModeRef: React.MutableRefObject<"once" | "loop" | "random">;
  noteIsPlayingRef: React.MutableRefObject<boolean>;

  /** Externally-owned refs so callers (togglePlayPause, activity logging) can
   *  still reach these values after the hook is called later in the render. */
  seamlessNextEntryRef: React.MutableRefObject<PracticeEntry | null>;
  loadedPracticeNoteRef: React.MutableRefObject<{ id: string; label: string } | null>;

  // State values (cause callback re-creation when changed)
  isPlaying: boolean;
  barMode: boolean;
  noteMode: boolean;
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  barRepeats: Record<number, BarRepeat>;
  loopBlocks: LoopBlock[];
  noteSamples: NoteSampleMap;
  noteSampleNames: NoteSampleNameMap;
  noteSampleSources: NoteSampleSourceMap;
  noteSampleChannels: NoteSampleChannelMap;
  noteSampleVolumes: NoteSampleVolumeMap;
  noteSampleSpeeds: NoteSampleSpeedMap;

  // Stable setters from useState / useBarMode / useSettings
  setBpm: (bpm: number) => void;
  /** If provided, syncs barBpm to entry.bpm when loading a bar-mode entry. */
  setBarBpm?: (bpm: number) => void;
  setBeatsPerMeasure: (n: number) => void;
  setBeatTypes: (types: BeatType[]) => void;
  setBeatSubdivisions: (subs: Record<string, BeatType[]>) => void;
  setBarRepeats: (repeats: Record<number, BarRepeat>) => void;
  setLoopBlocks: (blocks: LoopBlock[]) => void;
  setBarLoopMode: (mode: "loop" | "once") => void;
  setBlockPlayMode: (mode: "sequential" | "loop" | "random") => void;
  setSubdivisionPattern: (pattern: BeatType[]) => void;
  setNoteSamples: (samples: NoteSampleMap) => void;
  setNoteSampleNames: (names: NoteSampleNameMap) => void;
  setNoteSampleSources: (sources: NoteSampleSourceMap) => void;
  setNoteSampleChannels: (channels: NoteSampleChannelMap) => void;
  setNoteSampleVolumes: (volumes: NoteSampleVolumeMap) => void;
  setNoteSampleSpeeds: (speeds: NoteSampleSpeedMap) => void;
  setBarMode: (v: boolean) => void;
  setNoteMode: (v: boolean) => void;
  setIsPlaying: (v: boolean) => void;
  setIsPreparing: (v: boolean) => void;
  setNoteQueue: (q: PracticeEntry[]) => void;
  setNotePlayMode: (m: "once" | "loop" | "random") => void;
  setNoteCurrentIndex: (i: number) => void;
  setNoteIsPlaying: (v: boolean) => void;
  setNoteBarEntries: (entries: PracticeEntry[]) => void;

  // Stable callbacks
  stopRenderedAudio: () => void;
  clearSamplePlayStates: () => void;
  resetPlaybackVisuals: () => void;
  preloadNoteSampleSounds: (samples: NoteSampleMap, force?: boolean) => void;
  handleExitNoteMode: () => void;
  completePracticeSession: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Result interface
// ─────────────────────────────────────────────────────────────────────────────

export interface UsePracticeBookLoadResult {
  /** 캐시된 연습장 목록 (악보-마디 연결용). 외부에서 읽기 전용으로 사용. */
  scorePracticeBookRef: React.MutableRefObject<PracticeEntry[]>;
  /** 연습장 항목을 엔진/React 상태에 일괄 적용 (bar 모드 진입 전용). */
  applyEntryToEngine: (entry: PracticeEntry) => void;
  /** 악보 마디에 연결된 항목이 바뀌었을 때 엔진을 갱신. */
  handleLinkedEntryChange: (
    entryId: string | undefined,
    scoreDefaults: { bpm: number; beatsPerMeasure: number },
  ) => Promise<void>;
  /** 연습장에서 항목을 선택해 메트로놈에 로드. */
  handleLoadPracticeEntry: (entry: PracticeEntry) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/** Returns true for entries that should appear as note-mode sources:
 *  bar, beat, and score entries are valid sources; note entries are not. */
function isNoteSourceEntry(e: PracticeEntry): boolean {
  return (e.mode || "bar") === "bar" || e.mode === "score" || e.mode === "beat";
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function usePracticeBookLoad({
  engineRef,
  barModeRef,
  noteModeRef,
  barConfigRef,
  barBpmRef,
  dialConfigRef,
  beatDenominatorRef,
  noteSamplesRef,
  noteSampleNamesRef,
  noteSampleSourcesRef,
  noteSampleChannelsRef,
  noteSampleVolumesRef,
  noteSampleSpeedsRef,
  noteQueueRef,
  notePlayModeRef,
  noteIsPlayingRef,
  seamlessNextEntryRef: _seamlessNextEntryRef, // received but not used here; held by caller
  loadedPracticeNoteRef,
  isPlaying,
  barMode,
  noteMode,
  beatsPerMeasure,
  beatTypes,
  beatSubdivisions,
  barRepeats,
  loopBlocks,
  noteSamples,
  noteSampleNames,
  noteSampleSources,
  noteSampleChannels,
  noteSampleVolumes,
  noteSampleSpeeds,
  setBpm, setBarBpm,
  setBeatsPerMeasure,
  setBeatTypes,
  setBeatSubdivisions,
  setBarRepeats,
  setLoopBlocks,
  setBarLoopMode,
  setBlockPlayMode,
  setSubdivisionPattern,
  setNoteSamples,
  setNoteSampleNames,
  setNoteSampleSources,
  setNoteSampleChannels,
  setNoteSampleVolumes,
  setNoteSampleSpeeds,
  setBarMode,
  setNoteMode,
  setIsPlaying,
  setIsPreparing,
  setNoteQueue,
  setNotePlayMode,
  setNoteCurrentIndex,
  setNoteIsPlaying,
  setNoteBarEntries,
  stopRenderedAudio,
  clearSamplePlayStates,
  resetPlaybackVisuals,
  preloadNoteSampleSounds,
  handleExitNoteMode,
  completePracticeSession,
}: UsePracticeBookLoadParams): UsePracticeBookLoadResult {
  // ── 훅 내부 전용 refs ─────────────────────────────────────────────────────
  /** 악보 마디 연결 캐시 — handleLinkedEntryChange 전용 */
  const scorePracticeBookRef = useRef<PracticeEntry[]>([]);
  /** stale 방지 버전 카운터 — handleLinkedEntryChange 전용 */
  const linkedEntryVersionRef = useRef(0);

  // ── applyEntryToEngine ────────────────────────────────────────────────────
  /** 연습장 항목을 엔진·React 상태에 일괄 적용 (bar 모드 진입). */
  const applyEntryToEngine = useCallback((entry: PracticeEntry) => {
    const engine = engineRef.current;
    if (!engine) return;

    const { barRepeats: mgRepeats1, loopBlocks: mgBlocks1 } = migrateLayerBlocks(
      (entry.loopBlocks || []) as LoopBlock[],
      { ...entry.barRepeats },
    );
    setBpm(entry.bpm);
    // The shared loader is also used by linked practice-book entries. Keep the
    // bar-mode fallback tempo in sync so a legacy entry without an override
    // cannot inherit a tempo from a previously opened bar session.
    setBarBpm?.(entry.bpm);
    if (barBpmRef) barBpmRef.current = entry.bpm;
    setBeatsPerMeasure(entry.beatsPerMeasure);
    setBeatTypes([...entry.beatTypes]);
    setBeatSubdivisions({ ...entry.beatSubdivisions });
    setBarRepeats(mgRepeats1);
    setLoopBlocks([...mgBlocks1]);
    setBarLoopMode(entry.barLoopMode || "once");
    setBlockPlayMode(entry.blockPlayMode || "loop");
    if (entry.subdivisionPattern) setSubdivisionPattern([...entry.subdivisionPattern]);

    const entrySamples = entry.noteSamples || {};
    const entryNames = entry.noteSampleNames || {};
    const entrySources = entry.noteSampleSources || {};
    const entryChannels = entry.noteSampleChannels || {};
    const entryVolumes = entry.noteSampleVolumes || {};
    const entrySpeeds = entry.noteSampleSpeeds || {};
    setNoteSamples({ ...entrySamples });
    noteSamplesRef.current = { ...entrySamples };
    setNoteSampleNames({ ...entryNames });
    noteSampleNamesRef.current = { ...entryNames };
    setNoteSampleSources({ ...entrySources });
    noteSampleSourcesRef.current = { ...entrySources };
    setNoteSampleChannels({ ...entryChannels });
    noteSampleChannelsRef.current = { ...entryChannels };
    setNoteSampleVolumes({ ...entryVolumes });
    noteSampleVolumesRef.current = { ...entryVolumes };
    setNoteSampleSpeeds({ ...entrySpeeds });
    noteSampleSpeedsRef.current = { ...entrySpeeds };

    if (Object.keys(entrySamples).length > 0) {
      preloadNoteSampleSounds(entrySamples);
    }

    applyEntryToEngineCore(engine, entry, beatDenominatorRef.current);

    barConfigRef.current = entryToBarConfig(entry);

    if (!barMode) {
      dialConfigRef.current = {
        beatsPerMeasure,
        beatTypes: [...beatTypes],
        beatSubdivisions: { ...beatSubdivisions },
        noteSamples: { ...noteSamples },
        noteSampleNames: { ...noteSampleNames },
        noteSampleSources: { ...noteSampleSources },
        noteSampleChannels: { ...noteSampleChannels },
        noteSampleVolumes: { ...noteSampleVolumes },
        noteSampleSpeeds: { ...noteSampleSpeeds },
      };
      setBarMode(true);
    }
  }, [barMode, beatsPerMeasure, beatTypes, beatSubdivisions, noteSamples, noteSampleNames, noteSampleSources, noteSampleChannels, noteSampleVolumes, noteSampleSpeeds, preloadNoteSampleSounds]);

  // ── handleLinkedEntryChange ───────────────────────────────────────────────
  /** 악보 마디 연결 항목이 변경될 때 엔진을 갱신. */
  const handleLinkedEntryChange = useCallback(async (
    entryId: string | undefined,
    scoreDefaults: { bpm: number; beatsPerMeasure: number },
  ) => {
    const version = ++linkedEntryVersionRef.current;
    if (!entryId) {
      // 연결 없는 마디: 악보 기본 설정 복원
      const engine = engineRef.current;
      if (engine) {
        const clampedBpm = Math.max(20, Math.min(300, scoreDefaults.bpm));
        setBpm(clampedBpm);
        engine.setBpm(clampedBpm);
        setBeatsPerMeasure(scoreDefaults.beatsPerMeasure);
        engine.setBeatsPerMeasure(scoreDefaults.beatsPerMeasure);
      }
      return;
    }
    // 캐시된 연습장 우선 사용; 미스 시 로드 후 캐시 갱신
    let book = scorePracticeBookRef.current;
    if (book.length === 0) {
      book = await loadPracticeBook();
      scorePracticeBookRef.current = book;
    }
    if (version !== linkedEntryVersionRef.current) return; // stale
    const entry = book.find((e) => e.id === entryId);
    if (entry) {
      applyEntryToEngine(entry);
    }
  }, [applyEntryToEngine]);

  // ── handleLoadPracticeEntry ───────────────────────────────────────────────
  /** 연습장에서 선택한 항목을 메트로놈에 로드. */
  const handleLoadPracticeEntry = useCallback((entry: PracticeEntry) => {
    const engine = engineRef.current;
    if (!engine) return;

    if (isPlaying) {
      completePracticeSession();
      engine.stop();
      stopRenderedAudio();
      clearSamplePlayStates();
      setIsPreparing(false);
      setIsPlaying(false);
      resetPlaybackVisuals();
    }

    const entryMode = entry.mode || "bar";
    const isBeatEntry = entryMode === "beat";
    const isNoteEntry = entryMode === "note";

    if (isNoteEntry) {
      if (!noteMode) {
        setNoteMode(true);
        noteModeRef.current = true;
      }
      const queueEntries = entry.noteQueueEntries || [];
      setNoteQueue(queueEntries);
      noteQueueRef.current = queueEntries;
      setNotePlayMode(entry.notePlayMode || "once");
      notePlayModeRef.current = entry.notePlayMode || "once";
      setNoteCurrentIndex(-1);
      setNoteIsPlaying(false);
      noteIsPlayingRef.current = false;
      (async () => {
        const book = await loadPracticeBook();
        setNoteBarEntries(book.filter(isNoteSourceEntry));
      })();
      return;
    }

    if (noteMode) {
      handleExitNoteMode();
    }

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
          noteSampleChannels: { ...noteSampleChannels },
          noteSampleVolumes: { ...noteSampleVolumes },
          noteSampleSpeeds: { ...noteSampleSpeeds },
          hasBeenConfigured: true,
        };
        setBarMode(false);
      }

      const entrySamples = entry.noteSamples || {};
      const entryNames = entry.noteSampleNames || {};
      const entrySources = entry.noteSampleSources || {};
      const entryVolumes = entry.noteSampleVolumes || {};
      const entrySpeeds = entry.noteSampleSpeeds || {};

      dialConfigRef.current = {
        ...dialConfigRef.current,
        beatsPerMeasure: entry.beatsPerMeasure,
        beatTypes: [...entry.beatTypes],
        beatSubdivisions: { ...entry.beatSubdivisions },
        noteSamples: { ...entrySamples },
        noteSampleNames: { ...entryNames },
        noteSampleSources: { ...entrySources },
        noteSampleVolumes: { ...entryVolumes },
        noteSampleSpeeds: { ...entrySpeeds },
      };

      setBpm(entry.bpm);
      setBeatsPerMeasure(entry.beatsPerMeasure);
      setBeatTypes([...entry.beatTypes]);
      setBeatSubdivisions({ ...entry.beatSubdivisions });
      if (entry.subdivisionPattern) setSubdivisionPattern([...entry.subdivisionPattern]);
      setNoteSamples({ ...entrySamples });
      noteSamplesRef.current = { ...entrySamples };
      setNoteSampleNames({ ...entryNames });
      noteSampleNamesRef.current = { ...entryNames };
      setNoteSampleSources({ ...entrySources });
      noteSampleSourcesRef.current = { ...entrySources };
      setNoteSampleChannels({ ...(entry.noteSampleChannels || {}) });
      noteSampleChannelsRef.current = { ...(entry.noteSampleChannels || {}) };
      setNoteSampleVolumes({ ...entryVolumes });
      noteSampleVolumesRef.current = { ...entryVolumes };
      setNoteSampleSpeeds({ ...entrySpeeds });
      noteSampleSpeedsRef.current = { ...entrySpeeds };
      saveNoteSamples(entrySamples);
      saveNoteSampleNames(entryNames);
      saveNoteSampleSources(entrySources);
      saveNoteSampleChannels(entry.noteSampleChannels || {});
      saveNoteSampleVolumes(entryVolumes);
      saveNoteSampleSpeeds(entrySpeeds);
      if (Object.keys(entrySamples).length > 0) {
        preloadNoteSampleSounds(entrySamples);
      }

      engine.setBpm(toEngineBpm(entry.bpm, beatDenominatorRef.current));
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
          noteSampleVolumes: { ...noteSampleVolumes },
          noteSampleSpeeds: { ...noteSampleSpeeds },
        };
        setBarMode(true);
      }

      const barSamples = entry.noteSamples || {};
      const barNames = entry.noteSampleNames || {};
      const barSources = entry.noteSampleSources || {};
      const barChannels = entry.noteSampleChannels || {};
      const barVolumes = entry.noteSampleVolumes || {};
      const barSpeeds = entry.noteSampleSpeeds || {};

      const { barRepeats: mgRepeats3, loopBlocks: mgBlocks3 } = migrateLayerBlocks(
        (entry.loopBlocks || []) as LoopBlock[],
        { ...entry.barRepeats },
      );
      setBpm(entry.bpm);
      // Sync bar-mode's independent BPM so it matches the loaded entry
      setBarBpm?.(entry.bpm);
      if (barBpmRef) barBpmRef.current = entry.bpm;
      setBeatsPerMeasure(entry.beatsPerMeasure);
      setBeatTypes([...entry.beatTypes]);
      setBeatSubdivisions({ ...entry.beatSubdivisions });
      setBarRepeats(mgRepeats3);
      setLoopBlocks([...mgBlocks3]);
      setBarLoopMode(entry.barLoopMode);
      setBlockPlayMode(entry.blockPlayMode || "loop");
      setSubdivisionPattern([...entry.subdivisionPattern]);
      setNoteSamples({ ...barSamples });
      noteSamplesRef.current = { ...barSamples };
      setNoteSampleNames({ ...barNames });
      noteSampleNamesRef.current = { ...barNames };
      setNoteSampleSources({ ...barSources });
      noteSampleSourcesRef.current = { ...barSources };
      setNoteSampleChannels({ ...barChannels });
      noteSampleChannelsRef.current = { ...barChannels };
      setNoteSampleVolumes({ ...barVolumes });
      noteSampleVolumesRef.current = { ...barVolumes };
      setNoteSampleSpeeds({ ...barSpeeds });
      noteSampleSpeedsRef.current = { ...barSpeeds };
      saveNoteSamples(barSamples);
      saveNoteSampleNames(barNames);
      saveNoteSampleSources(barSources);
      saveNoteSampleChannels(barChannels);
      saveNoteSampleVolumes(barVolumes);
      saveNoteSampleSpeeds(barSpeeds);
      if (Object.keys(barSamples).length > 0) {
        preloadNoteSampleSounds(barSamples);
      }

      engine.setBpm(toEngineBpm(entry.bpm, beatDenominatorRef.current));
      engine.setBeatsPerMeasure(entry.beatsPerMeasure);
      engine.setBeatTypes([...entry.beatTypes]);
      engine.setAllBeatSubdivisions(entry.beatSubdivisions);
      engine.setLoopBlocks(mgBlocks3);
      engine.setBlockPlayMode(entry.blockPlayMode || "loop");
      engine.setAllBarRepeats(mgRepeats3 || {});
      const bpmOverridesEntry: Record<number, number> = {};
      for (const [k, v] of Object.entries(mgRepeats3 || {})) {
        if (typeof (v as { bpm?: number }).bpm === "number" && (v as { bpm: number }).bpm > 0) {
          bpmOverridesEntry[Number(k)] = toEngineBpm(
            (v as { bpm: number }).bpm,
            (v as BarRepeat).meterDenominator ?? beatDenominatorRef.current,
          );
        }
      }
      engine.setAllBarBpmOverrides(bpmOverridesEntry);
      barConfigRef.current = {
        ...barConfigRef.current,
        beatsPerMeasure: entry.beatsPerMeasure,
        beatTypes: [...entry.beatTypes],
        beatSubdivisions: { ...entry.beatSubdivisions },
        barRepeats: { ...mgRepeats3 },
        loopBlocks: [...mgBlocks3],
        barClockMode: entry.barClockMode || "stopwatch",
        barTimerDuration: entry.barTimerDuration ?? 180,
        noteSamples: { ...barSamples },
        noteSampleNames: { ...barNames },
        noteSampleSources: { ...barSources },
        noteSampleSpeeds: { ...barSpeeds },
        hasBeenConfigured: true,
      };
    }

    loadedPracticeNoteRef.current = { id: entry.id, label: entry.label };
  }, [isPlaying, barMode, noteMode, beatsPerMeasure, beatTypes, beatSubdivisions, barRepeats, loopBlocks, noteSamples, noteSampleNames, noteSampleSources, preloadNoteSampleSounds, handleExitNoteMode, completePracticeSession]);

  return {
    scorePracticeBookRef,
    applyEntryToEngine,
    handleLinkedEntryChange,
    handleLoadPracticeEntry,
  };
}
