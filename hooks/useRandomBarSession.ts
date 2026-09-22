import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import type { MetronomeEngine } from "@/lib/metronome-engine";
import {
  DEFAULT_BAR_RANDOM_CONFIG,
  appendBarRandomPlaybackChunk,
  buildBarRandomSourceIndexes,
  createBarRandomSession,
  getBarRandomCandidateCount,
  type BarRandomConfig,
  type BarRandomSession,
} from "@/lib/bar-random-session";
import { createPracticeEntry, loadPracticeBook, savePracticeBook } from "@/lib/storage";
import { captureBreadcrumb } from "@/lib/error-tracking";

type BlockPlayMode = "sequential" | "loop" | "random";

export interface UseRandomBarSessionParams {
  strategy: BarRandomConfig["strategy"];
  setStrategy: (strategy: BarRandomConfig["strategy"]) => void;
  persistSettings: (settings: { barRandomStrategy: BarRandomConfig["strategy"] }) => void;
  engineRef: MutableRefObject<MetronomeEngine | null>;
  blockPlayModeRef: MutableRefObject<BlockPlayMode>;
  setBlockPlayMode: (mode: BlockPlayMode) => void;
  isPlaying: boolean;
  isPreparing: boolean;
  barMode: boolean;
  barConfigRef: MutableRefObject<any>;
  barLoopModeRef: MutableRefObject<"loop" | "once">;
  barBpmRef: MutableRefObject<number>;
  username: string;
  noteSamplesRef: MutableRefObject<any>;
  noteSampleNamesRef: MutableRefObject<any>;
  noteSampleSourcesRef: MutableRefObject<any>;
  noteSampleChannelsRef: MutableRefObject<any>;
  noteSampleVolumesRef: MutableRefObject<any>;
  noteSampleSpeedsRef: MutableRefObject<any>;
  setBeatsPerMeasure: Dispatch<SetStateAction<number>>;
  setBeatTypes: Dispatch<SetStateAction<any>>;
  setBeatSubdivisions: Dispatch<SetStateAction<any>>;
  setBarRepeats: Dispatch<SetStateAction<any>>;
  setLoopBlocks: Dispatch<SetStateAction<any>>;
  setBarStartBeat: Dispatch<SetStateAction<number | null>>;
  setNoteSamples: Dispatch<SetStateAction<any>>;
  setNoteSampleNames: Dispatch<SetStateAction<any>>;
  setNoteSampleSources: Dispatch<SetStateAction<any>>;
  setNoteSampleChannels: Dispatch<SetStateAction<any>>;
  setNoteSampleVolumes: Dispatch<SetStateAction<any>>;
  setNoteSampleSpeeds: Dispatch<SetStateAction<any>>;
  scheduleReRender: () => void;
}

export interface UseRandomBarSessionResult {
  randomBarSession: BarRandomSession | null;
  randomBarSessionRef: MutableRefObject<BarRandomSession | null>;
  randomBarViewportCapacityRef: MutableRefObject<number>;
  randomBarChunkStartRef: MutableRefObject<number>;
  randomBarChunkLengthRef: MutableRefObject<number>;
  randomBarPreparedChunkRef: MutableRefObject<{
    chunk: number[];
    nextSession: BarRandomSession;
  } | null>;
  randomBarPreviousModeRef: MutableRefObject<BlockPlayMode | null>;
  randomBarConfig: BarRandomConfig;
  randomBarConfigRef: MutableRefObject<BarRandomConfig>;
  updateRandomBarSession: (session: BarRandomSession | null) => void;
  setRandomBarConfig: (config: BarRandomConfig) => void;
  finishRandomBarPlay: () => void;
  handleRandomBarPlay: (togglePlayPause: () => void) => void;
  handleReplayRandomBarSession: (togglePlayPause: () => void) => void;
  handleSaveRandomBarSession: () => Promise<boolean>;
  handleApplyRandomBarSession: () => void;
  handleReturnToOriginalBarList: (togglePlayPause: () => void) => void;
  advanceRandomBarChunk: (engine: MetronomeEngine) => void;
}

/**
 * Owns the mutable lifecycle of a generated Bar-mode random sequence.
 *
 * Playback and bar editing remain in useMetronomeScreen; this hook only owns
 * the session snapshot and the mode hand-off so the two sides cannot create
 * competing refs or stale cleanup effects.
 */
export function useRandomBarSession(
  p: UseRandomBarSessionParams,
): UseRandomBarSessionResult {
  const [randomBarSession, setRandomBarSession] =
    useState<BarRandomSession | null>(null);
  const randomBarSessionRef = useRef<BarRandomSession | null>(null);
  const randomBarViewportCapacityRef = useRef(4);
  const randomBarChunkStartRef = useRef(0);
  const randomBarChunkLengthRef = useRef(0);
  const randomBarPreparedChunkRef = useRef<{
    chunk: number[];
    nextSession: BarRandomSession;
  } | null>(null);
  const randomBarPreviousModeRef = useRef<BlockPlayMode | null>(null);
  const randomBarPlaybackBecameActiveRef = useRef(false);

  const randomBarConfig = useMemo<BarRandomConfig>(
    () => ({ ...DEFAULT_BAR_RANDOM_CONFIG, strategy: p.strategy }),
    [p.strategy],
  );
  const randomBarConfigRef = useRef(randomBarConfig);
  useEffect(() => {
    randomBarConfigRef.current = randomBarConfig;
  }, [randomBarConfig]);

  const updateRandomBarSession = useCallback(
    (session: BarRandomSession | null) => {
      randomBarSessionRef.current = session;
      setRandomBarSession(session ? { ...session, order: [...session.order] } : null);
    },
    [],
  );

  const setRandomBarConfig = useCallback(
    (config: BarRandomConfig) => {
      p.setStrategy(config.strategy);
      p.persistSettings({ barRandomStrategy: config.strategy });
    },
    [p.persistSettings, p.setStrategy],
  );

  const finishRandomBarPlay = useCallback(() => {
    const previousMode = randomBarPreviousModeRef.current;
    if (previousMode === null) return;
    randomBarPreviousModeRef.current = null;
    randomBarPreparedChunkRef.current = null;
    p.blockPlayModeRef.current = previousMode;
    p.setBlockPlayMode(previousMode);
    p.engineRef.current?.setRandomBarOrder(null);
    p.engineRef.current?.setBlockPlayMode(previousMode);
    const session = randomBarSessionRef.current;
    if (session) {
      session.active = false;
      updateRandomBarSession(session);
    }
  }, [p.blockPlayModeRef, p.engineRef, p.setBlockPlayMode, updateRandomBarSession]);

  useEffect(() => {
    if (randomBarPreviousModeRef.current === null) {
      randomBarPlaybackBecameActiveRef.current = false;
      return;
    }
    if (p.isPlaying || p.isPreparing) {
      randomBarPlaybackBecameActiveRef.current = true;
      return;
    }
    if (randomBarPlaybackBecameActiveRef.current) {
      randomBarPlaybackBecameActiveRef.current = false;
      finishRandomBarPlay();
    }
  }, [finishRandomBarPlay, p.isPlaying, p.isPreparing]);

  const handleRandomBarPlay = useCallback((togglePlayPause: () => void) => {
    if (!p.barMode || p.isPlaying || p.isPreparing || randomBarPreviousModeRef.current !== null) return;
    const sourceCount = p.barConfigRef.current.beatsPerMeasure;
    if (sourceCount <= 0) return;
    const candidateCount = getBarRandomCandidateCount(sourceCount, p.barConfigRef.current.barRepeats);
    const blocks = p.barConfigRef.current.loopBlocks.filter((block: any) => block.startBeat < candidateCount);
    const session = createBarRandomSession(sourceCount, buildBarRandomSourceIndexes(sourceCount, blocks, candidateCount), p.barConfigRef.current.loopBlocks);
    const repeat = p.barLoopModeRef.current === "loop";
    const chunk = appendBarRandomPlaybackChunk(session, repeat ? Math.max(2, randomBarViewportCapacityRef.current * 2) : sourceCount, repeat, randomBarConfig);
    if (!chunk.length) return;
    randomBarChunkStartRef.current = 0;
    randomBarChunkLengthRef.current = chunk.length;
    randomBarPreparedChunkRef.current = null;
    updateRandomBarSession(session);
    randomBarPreviousModeRef.current = p.blockPlayModeRef.current;
    p.blockPlayModeRef.current = "random";
    p.setBlockPlayMode("random");
    p.engineRef.current?.setRandomBarOrder(chunk);
    p.engineRef.current?.setBlockPlayMode("random");
    togglePlayPause();
  }, [p.barConfigRef, p.barLoopModeRef, p.barMode, p.blockPlayModeRef, p.engineRef, p.isPlaying, p.isPreparing, p.setBlockPlayMode, randomBarConfig, updateRandomBarSession]);

  const handleReplayRandomBarSession = useCallback((togglePlayPause: () => void) => {
    const previous = randomBarSessionRef.current;
    if (!previous || !previous.order.length || p.isPlaying || p.isPreparing) return;
    if (previous.loopBlocks && JSON.stringify(previous.loopBlocks) !== JSON.stringify(p.barConfigRef.current.loopBlocks)) {
      updateRandomBarSession(null);
      return;
    }
    const session = { ...previous, order: [...previous.order], cursor: 0, active: true };
    randomBarChunkStartRef.current = 0;
    randomBarChunkLengthRef.current = session.order.length;
    randomBarPreparedChunkRef.current = null;
    updateRandomBarSession(session);
    randomBarPreviousModeRef.current = p.blockPlayModeRef.current;
    p.blockPlayModeRef.current = "random";
    p.setBlockPlayMode("random");
    p.engineRef.current?.setRandomBarOrder(session.order);
    p.engineRef.current?.setBlockPlayMode("random");
    togglePlayPause();
  }, [p.barConfigRef, p.blockPlayModeRef, p.engineRef, p.isPlaying, p.isPreparing, p.setBlockPlayMode, updateRandomBarSession]);

  const handleSaveRandomBarSession = useCallback(async (): Promise<boolean> => {
    const session = randomBarSessionRef.current;
    if (!session?.order.length || (session.loopBlocks && JSON.stringify(session.loopBlocks) !== JSON.stringify(p.barConfigRef.current.loopBlocks))) return false;
    try {
      const source = p.barConfigRef.current;
      const now = new Date();
      const entry = createPracticeEntry(`Random ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`, {
        mode: "bar", bpm: p.barBpmRef.current, beatsPerMeasure: source.beatsPerMeasure,
        beatTypes: [...source.beatTypes], beatSubdivisions: { ...source.beatSubdivisions },
        barRepeats: { ...source.barRepeats }, loopBlocks: session.loopBlocks ? session.loopBlocks.map((block: any) => ({ ...block })) : [...source.loopBlocks],
        blockPlayMode: "random", randomBarOrder: [...session.order], barLoopMode: "once",
        subdivisionPattern: [...(source.subdivisionPattern ?? ["accent"])],
        noteSamples: { ...source.noteSamples }, noteSampleNames: { ...source.noteSampleNames },
        noteSampleSources: { ...source.noteSampleSources }, noteSampleChannels: { ...source.noteSampleChannels },
        noteSampleVolumes: { ...(source.noteSampleVolumes ?? {}) }, noteSampleSpeeds: { ...(source.noteSampleSpeeds ?? {}) },
      }, p.username);
      await savePracticeBook([entry, ...(await loadPracticeBook())]);
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    } catch (error) {
      captureBreadcrumb({ category: "practice-book", message: "Random bar session save error", level: "warning", data: { error: String(error) } });
      return false;
    }
  }, [p.barBpmRef, p.barConfigRef, p.username]);

  const materializeRandomBarOrder = useCallback((requestedOrder: number[]) => {
    const source = p.barConfigRef.current;
    const order = requestedOrder.filter(index => index >= 0 && index < source.beatsPerMeasure);
    const remap = (map: Record<string, unknown> | undefined) => {
      const result: Record<string, unknown> = {};
      order.forEach((sourceBeat, targetBeat) => {
        Object.entries(map ?? {}).forEach(([key, value]) => {
          const [beat, ...rest] = key.split("-");
          if (Number(beat) === sourceBeat) result[[targetBeat, ...rest].join("-")] = value;
        });
      });
      return result;
    };
    const beatSubdivisions: Record<string, unknown[]> = {};
    const barRepeats: Record<number, any> = {};
    order.forEach((sourceBeat, targetBeat) => {
      const subdivisions = source.beatSubdivisions[String(sourceBeat)];
      if (subdivisions?.length) beatSubdivisions[String(targetBeat)] = [...subdivisions];
      const repeat = source.barRepeats[sourceBeat];
      if (repeat) {
        const { jumpFromId: _a, jumpToId: _b, voltaMax: _c, isEnd: _d, ...portable } = repeat;
        barRepeats[targetBeat] = {
          ...portable,
          layers: portable.layers?.map((layer: any) => ({ ...layer })),
        };
      }
    });
    return {
      order,
      beatsPerMeasure: order.length,
      beatTypes: order.map(index => source.beatTypes[index] ?? "normal"),
      beatSubdivisions,
      barRepeats,
      noteSamples: remap(source.noteSamples),
      noteSampleNames: remap(source.noteSampleNames),
      noteSampleSources: remap(source.noteSampleSources),
      noteSampleChannels: remap(source.noteSampleChannels),
      noteSampleVolumes: remap(source.noteSampleVolumes),
      noteSampleSpeeds: remap(source.noteSampleSpeeds),
    };
  }, [p.barConfigRef]);

  const handleApplyRandomBarSession = useCallback(() => {
    const session = randomBarSessionRef.current;
    if (!session?.order.length || p.isPlaying || p.isPreparing) return;
    const source = p.barConfigRef.current;
    const sourceCount = source.beatsPerMeasure;
    const randomUnits = new Set(buildBarRandomSourceIndexes(sourceCount, source.loopBlocks));
    const topLevelByStart = new Map<number, any>();
    source.loopBlocks.forEach((block: any) => {
      if (block.layerOf !== undefined || !randomUnits.has(block.startBeat)) return;
      const existing = topLevelByStart.get(block.startBeat);
      if (!existing || block.endBeat > existing.endBeat) topLevelByStart.set(block.startBeat, block);
    });
    const expandedOrder = session.order.flatMap(index => {
      const block = topLevelByStart.get(index);
      return block
        ? Array.from({ length: Math.min(sourceCount - 1, block.endBeat) - index + 1 }, (_, offset) => index + offset)
        : [index];
    });
    const uniqueOrder = Array.from(new Set(expandedOrder)).filter(index => index >= 0 && index < sourceCount);
    for (let index = 0; index < sourceCount; index += 1) {
      if (!uniqueOrder.includes(index)) uniqueOrder.push(index);
    }
    const next = materializeRandomBarOrder(uniqueOrder);
    if (next.beatsPerMeasure === 0) return;
    p.setBeatsPerMeasure(next.beatsPerMeasure);
    p.setBeatTypes(next.beatTypes);
    p.setBeatSubdivisions(next.beatSubdivisions as any);
    p.setBarRepeats(next.barRepeats);
    p.setLoopBlocks([]);
    p.setBarStartBeat(null);
    p.setNoteSamples(next.noteSamples);
    p.noteSamplesRef.current = next.noteSamples;
    p.setNoteSampleNames(next.noteSampleNames);
    p.noteSampleNamesRef.current = next.noteSampleNames;
    p.setNoteSampleSources(next.noteSampleSources);
    p.noteSampleSourcesRef.current = next.noteSampleSources;
    p.setNoteSampleChannels(next.noteSampleChannels);
    p.noteSampleChannelsRef.current = next.noteSampleChannels;
    p.setNoteSampleVolumes(next.noteSampleVolumes);
    p.noteSampleVolumesRef.current = next.noteSampleVolumes;
    p.setNoteSampleSpeeds(next.noteSampleSpeeds);
    p.noteSampleSpeedsRef.current = next.noteSampleSpeeds;
    p.barConfigRef.current = { ...source, ...next, loopBlocks: [], hasBeenConfigured: true };
    p.engineRef.current?.setRandomBarOrder(null);
    p.engineRef.current?.setBeatsPerMeasure(next.beatsPerMeasure);
    p.engineRef.current?.setBeatTypes(next.beatTypes);
    p.engineRef.current?.setAllBeatSubdivisions(next.beatSubdivisions as any);
    p.engineRef.current?.setAllBarRepeats(next.barRepeats);
    p.engineRef.current?.setLoopBlocks([]);
    updateRandomBarSession(null);
    p.scheduleReRender();
  }, [materializeRandomBarOrder, p, updateRandomBarSession]);

  const advanceRandomBarChunk = useCallback((engine: MetronomeEngine) => {
    const session = randomBarSessionRef.current;
    if (!session?.active || randomBarPreviousModeRef.current === null || !engine.getIsRunning() || p.barLoopModeRef.current !== "loop") return;
    const nextStart = randomBarChunkStartRef.current + randomBarChunkLengthRef.current;
    const nextLength = Math.max(2, randomBarViewportCapacityRef.current * 2);
    const prepared = randomBarPreparedChunkRef.current;
    const nextChunk = prepared?.chunk ?? appendBarRandomPlaybackChunk(session, nextLength, true, randomBarConfigRef.current);
    if (prepared) {
      session.order = prepared.nextSession.order;
      session.remainingShuffleBag = prepared.nextSession.remainingShuffleBag;
    }
    randomBarPreparedChunkRef.current = null;
    session.cursor = nextStart;
    randomBarChunkStartRef.current = nextStart;
    randomBarChunkLengthRef.current = nextChunk.length;
    updateRandomBarSession(session);
    engine.setRandomBarOrder(nextChunk);
  }, [p.barLoopModeRef, updateRandomBarSession]);

  return {
    randomBarSession,
    randomBarSessionRef,
    randomBarViewportCapacityRef,
    randomBarChunkStartRef,
    randomBarChunkLengthRef,
    randomBarPreparedChunkRef,
    randomBarPreviousModeRef,
    randomBarConfig,
    randomBarConfigRef,
    updateRandomBarSession,
    setRandomBarConfig,
    finishRandomBarPlay,
    handleRandomBarPlay,
    handleReplayRandomBarSession,
    handleSaveRandomBarSession,
    handleApplyRandomBarSession,
    handleReturnToOriginalBarList: (togglePlayPause) => {
      if (p.isPlaying || p.isPreparing) togglePlayPause();
      finishRandomBarPlay();
      randomBarPreparedChunkRef.current = null;
      updateRandomBarSession(null);
    },
    advanceRandomBarChunk,
  };
}