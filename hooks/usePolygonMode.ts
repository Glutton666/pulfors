/**
 * usePolygonMode — 폴리곤 메트로놈 상태 및 오디오 훅 (v5)
 *
 * 설계 원칙:
 * - 비트 트리거는 엔진 오디오 콜백(engineBeatCallbackRef)을 통해 직접 구동된다.
 *   React state(currentBeat, measureCount) 의존 없음 → rAF 지터/마디 경계 이중 발화 없음.
 * - isPlaying은 재생 중단 시 상태 리셋 전용으로만 사용된다.
 * - enabled=false이면 핸들러를 ref에서 즉시 해제하고 상태를 초기화한다.
 * - 레이어 데이터는 layersRef를 통해 핸들러 내에서 항상 최신값을 읽는다.
 * - 꼭짓점별 강세(beatTypes: S/A/N/M)를 지원한다. 미설정 인덱스는 role로 fallback.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import { playPolygonAudioOutput, type AudioOutputOwner } from "@/lib/audio-output-owner";
import type { BuiltinPlayers } from "@/hooks/useAudioPlayers";
import type { ClickPCMs } from "@/lib/audio-renderer";
import type { SoundSet } from "@/lib/storage";
import { buildPolygonPlaybackPlan, type PolygonPlaybackPlan } from "@/lib/audio-playback-plan";
import {
  buildPolygonSchedule,
  createPolygonScheduleRunner,
  type PolygonSchedule,
  type PolygonScheduleEvent,
  type PolygonScheduleRunner,
} from "@/lib/polygon-scheduler";
import {
  PolygonLayer,
  VertexBeatType,
  LAYER_COLORS,
  DEFAULT_POLYGON_LAYER,
  getVertexBeatType,
  cycleVertexBeatType,
} from "@/components/polygon-mode/PolygonTypes";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UsePolygonModeParams {
  /**
   * 폴리곤 뷰가 화면에 표시 중인지 여부.
   * false이면 engineBeatCallbackRef를 해제하고 상태를 초기화한다.
   * 훅은 항상(unconditionally) 호출해야 한다.
   */
  enabled: boolean;
  /**
   * 재생 중 여부.
   * 오디오 트리거 자체가 아니라, 재생 중단 시 absoluteBeat 리셋 전용으로 사용된다.
   */
  isPlaying: boolean;
  /**
   * 엔진 오디오 콜백이 매 비트마다 호출하는 ref.
   * useMetronomeScreen이 engine.setAudioCallbacks 내부에서 이 ref를 호출한다.
   * usePolygonMode는 enabled=true이면 자신의 핸들러를 이 ref에 등록한다.
   */
  engineBeatCallbackRef: React.MutableRefObject<(() => void) | null>;
  /** BPM (마디·오프셋 타이밍 계산용) */
  bpm: number;
  /** 한 마디의 박 수 — N각형은 이 마디를 N등분해 발화한다 (폴리리듬) */
  beatsPerMeasure: number;
  /** 내장 오디오 플레이어 ref (native) */
  allPlayersRef: React.MutableRefObject<BuiltinPlayers>;
  /** 전역 PCM 캐시 ref (read-only) */
  clickPCMCacheRef: React.MutableRefObject<Record<string, ClickPCMs>>;
  /** 볼륨 ref */
  volumeRef: React.MutableRefObject<number>;
  /** PCM 로더 콜백 (web에서 레이어별 사운드셋 비동기 로드) */
  getClickPCMs: (set: SoundSet) => Promise<ClickPCMs>;
  /** 폴리곤 자체 출력도 시작 확인·watchdog에 오디오 활동으로 보고한다. */
  recordAudioActivity: () => boolean;
  outputOwner: AudioOutputOwner;
}

export interface UsePolygonModeResult {
  layers: PolygonLayer[];
  editingLayerId: string | null;
  setEditingLayerId: (id: string | null) => void;
  activeVertices: Record<string, number>;
  offsetPopup: { layerId: string; vertexIdx: number } | null;
  setOffsetPopup: (v: { layerId: string; vertexIdx: number } | null) => void;
  handleAddLayer: () => void;
  handleDeleteLayer: (id: string) => void;
  handleUpdateLayer: (id: string, patch: Partial<PolygonLayer>) => void;
  handleSetOffset: (layerId: string, vertexIdx: number, offset: number) => void;
  /** 꼭짓점을 탭할 때마다 S/A/N/M 순환 */
  handleVertexBeatTypeCycle: (layerId: string, vertexIdx: number) => void;
  /** 커스텀 사운드 PCM을 훅 캐시에 등록하고 해당 레이어의 soundSet을 갱신한다 */
  setLayerCustomSound: (layerId: string, pcms: ClickPCMs) => void;
}

/**
 * VertexBeatType → playWebClick의 role 인자로 변환.
 * mute는 호출 전에 건너뛰므로 여기선 다루지 않는다.
 */
function beatTypeToWebClickRole(bt: VertexBeatType): "strong" | "high" | "low" {
  if (bt === "strong") return "strong";
  if (bt === "accent") return "high";
  return "low";
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

const INITIAL_LAYERS: PolygonLayer[] = [
  {
    id: "default-0",
    sides: 4,
    color: LAYER_COLORS[0],
    soundSet: "classic",
    role: "high",
    volume: 1.0,
    offsets: [],
    beatTypes: [],
  },
];

export function usePolygonMode(p: UsePolygonModeParams): UsePolygonModeResult {
  const playPolygonOutput = playPolygonAudioOutput(p.outputOwner);
  const [layers, setLayers] = useState<PolygonLayer[]>(INITIAL_LAYERS);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [activeVertices, setActiveVertices] = useState<Record<string, number>>({});
  const [offsetPopup, setOffsetPopup] = useState<{
    layerId: string;
    vertexIdx: number;
  } | null>(null);

  // ── 엔진 콜백에서 항상 최신값을 읽기 위한 refs ─────────────────────────
  const layersRef = useRef(layers);
  useEffect(() => { layersRef.current = layers; }, [layers]);

  const bpmRef = useRef(p.bpm);
  useEffect(() => { bpmRef.current = p.bpm; }, [p.bpm]);

  const beatsPerMeasureRef = useRef(p.beatsPerMeasure);
  useEffect(() => { beatsPerMeasureRef.current = p.beatsPerMeasure; }, [p.beatsPerMeasure]);

  const enabledRef = useRef(p.enabled);
  enabledRef.current = p.enabled;
  const isPlayingRef = useRef(p.isPlaying);
  isPlayingRef.current = p.isPlaying;
  const activePlaybackPlanRef = useRef<PolygonPlaybackPlan | null>(null);
  // Keep the required production call at the hook boundary; active playback
  // still replaces this snapshot only at explicit lifecycle/edit boundaries.
  const initialSchedule = buildPolygonSchedule({
    layers,
    beatsPerMeasure: p.beatsPerMeasure,
  });
  const activeScheduleRef = useRef<PolygonSchedule | null>(
    p.isPlaying ? initialSchedule : null,
  );
  const sessionIdRef = useRef(0);
  const producerGenerationRef = useRef(0);
  const runnerRef = useRef<PolygonScheduleRunner | null>(null);
  const replaceActivePlaybackPlan = useCallback((
    nextLayers = layersRef.current,
    nextBpm = bpmRef.current,
    nextBeatsPerMeasure = beatsPerMeasureRef.current,
  ) => {
    if (!activePlaybackPlanRef.current) return;
    activePlaybackPlanRef.current = buildPolygonPlaybackPlan({
      platform: Platform.OS === "web" ? "web" : "native",
      bpm: nextBpm,
      beatsPerMeasure: nextBeatsPerMeasure,
      layers: nextLayers,
    });
    activeScheduleRef.current = buildPolygonSchedule({
      layers: nextLayers,
      beatsPerMeasure: nextBeatsPerMeasure,
    });
  }, []);

  useEffect(() => {
    runnerRef.current?.cancelSession(sessionIdRef.current);
    sessionIdRef.current += 1;
    absoluteBeatRef.current = 0;
    activePlaybackPlanRef.current = p.isPlaying
      ? buildPolygonPlaybackPlan({
          platform: Platform.OS === "web" ? "web" : "native",
          bpm: p.bpm,
          beatsPerMeasure: p.beatsPerMeasure,
          layers,
        })
      : null;
    activeScheduleRef.current = p.isPlaying
      ? buildPolygonSchedule({ layers, beatsPerMeasure: p.beatsPerMeasure })
      : null;
    // Playback starts from one complete snapshot. Live edits replace that
    // snapshot atomically at the same boundary that clears old timers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.isPlaying]);

  // ── 절대 비트 카운터 (엔진 콜백 내에서만 변경) ──────────────────────────
  const absoluteBeatRef = useRef(0);

  // ── Per-layer PCM 캐시 (전역 clickPCMCacheRef와 분리) ───────────────────
  const polygonPCMCacheRef = useRef<Map<string, ClickPCMs>>(new Map());
  const loadingRef = useRef<Set<string>>(new Set());

  const ensurePCM = useCallback(
    (soundSet: string) => {
      if (Platform.OS !== "web") return;
      // 사용자 업로드 커스텀 사운드는 이미 캐시에 등록되어 있으므로 네트워크 요청 불필요
      if (soundSet.startsWith("custom-")) return;
      if (polygonPCMCacheRef.current.has(soundSet)) return;
      if (loadingRef.current.has(soundSet)) return;
      loadingRef.current.add(soundSet);
      p.getClickPCMs(soundSet as SoundSet)
        .then((pcms) => { polygonPCMCacheRef.current.set(soundSet, pcms); })
        .catch(() => {})
        .finally(() => { loadingRef.current.delete(soundSet); });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.getClickPCMs],
  );

  if (!runnerRef.current) {
    runnerRef.current = createPolygonScheduleRunner((event: PolygonScheduleEvent) => {
      if (event.type === "mute") {
        setActiveVertices((prev) => {
          if (!(event.layerId in prev)) return prev;
          const next = { ...prev };
          delete next[event.layerId];
          return next;
        });
        return;
      }
      const soundRole = beatTypeToWebClickRole(event.type as VertexBeatType);
      const cached = Platform.OS === "web"
        ? polygonPCMCacheRef.current.get(event.soundSet)
          ?? p.clickPCMCacheRef.current[event.soundSet]
        : undefined;
      const played = playPolygonOutput({
        soundSet: event.soundSet,
        role: soundRole,
        volume: p.volumeRef.current * event.volume,
        pcm: cached?.[soundRole],
        channel: "both",
        pools: p.allPlayersRef.current,
      });
      if (!cached && Platform.OS === "web") ensurePCM(event.soundSet);
      if (played) p.recordAudioActivity();
      setActiveVertices((prev) =>
        prev[event.layerId] === event.vertex ? prev : { ...prev, [event.layerId]: event.vertex },
      );
    });
  }

  // enabled=true 시 / 레이어 사운드셋 변경 시 PCM 선제 로드
  useEffect(() => {
    if (!p.enabled || Platform.OS !== "web") return;
    layers.forEach((l) => ensurePCM(l.soundSet));
  }, [p.enabled, layers, ensurePCM]);

  // ── 재생 중단 → absoluteBeat 리셋 ──────────────────────────────────────
  // 엔진이 멈추면 더 이상 콜백이 오지 않으므로 카운터만 초기화한다.
  // 비주얼 리셋(setActiveVertices)은 enabled가 false가 될 때 처리한다.
  useEffect(() => {
    if (!p.isPlaying) {
      runnerRef.current?.cancelSession(sessionIdRef.current);
      sessionIdRef.current += 1;
      activePlaybackPlanRef.current = null;
      activeScheduleRef.current = null;
      absoluteBeatRef.current = 0;
    }
  }, [p.isPlaying]);

  // ── BPM 변경 → 예약된 슬롯 취소 (다음 비트부터 새 BPM 적용) ────────────
  // BPM이 바뀌면 현재 마디에서 아직 발화되지 않은 슬롯을 취소한다.
  // 엔진이 다음 비트 콜백을 보낼 때 새 BPM 기준으로 재예약된다.
  const prevBpmRef = useRef(p.bpm);
  useEffect(() => {
    if (prevBpmRef.current !== p.bpm) {
      prevBpmRef.current = p.bpm;
      bpmRef.current = p.bpm;
      runnerRef.current?.cancelSession(sessionIdRef.current);
      sessionIdRef.current += 1;
      replaceActivePlaybackPlan(layersRef.current, p.bpm, beatsPerMeasureRef.current);
    }
  }, [p.bpm, replaceActivePlaybackPlan]);

  // ── 박자표 변경 → 위상 재정렬 ──────────────────────────────────────────
  // 엔진이 자체 비트 카운터를 0으로 리셋하므로, 폴리곤도 다음 콜백을
  // 마디 시작(beat 0)으로 인식하도록 절대 비트 카운터를 리셋한다.
  // 옛 타이밍으로 예약된 현재 비트 구간의 잔여 타이머도 취소한다.
  const prevMeterRef = useRef(p.beatsPerMeasure);
  useEffect(() => {
    if (prevMeterRef.current !== p.beatsPerMeasure) {
      prevMeterRef.current = p.beatsPerMeasure;
      beatsPerMeasureRef.current = p.beatsPerMeasure;
      runnerRef.current?.cancelSession(sessionIdRef.current);
      sessionIdRef.current += 1;
      absoluteBeatRef.current = 0;
      replaceActivePlaybackPlan(layersRef.current, bpmRef.current, p.beatsPerMeasure);
    }
  }, [p.beatsPerMeasure, replaceActivePlaybackPlan]);

  // ── 엔진 비트 핸들러 등록/해제 ──────────────────────────────────────────
  // 웹도 꼭짓점 타이머에서 realtime click을 재생한다. AudioContext 미래 예약은
  // 브라우저별로 무음이 될 수 있어 사용하지 않는다.
  useEffect(() => {
    const producerGeneration = ++producerGenerationRef.current;
    enabledRef.current = p.enabled;
    isPlayingRef.current = p.isPlaying;
    if (!p.enabled || !p.isPlaying) {
      // 엔진 콜백 해제 및 재생 상태 초기화.
      // 레이어 설정(layers, editingLayerId)은 보존한다:
      // 사용자가 폴리곤 모드를 닫았다 다시 열어도 설정한 레이어가 남아 있어야 한다.
      p.engineBeatCallbackRef.current = null;
      runnerRef.current?.cancelSession(sessionIdRef.current);
      sessionIdRef.current += 1;
      activePlaybackPlanRef.current = null;
      activeScheduleRef.current = null;
      absoluteBeatRef.current = 0;
      if (!p.enabled) {
        setOffsetPopup(null);
        setActiveVertices({});
      }
      return;
    }

    p.engineBeatCallbackRef.current = () => {
      if (
        producerGeneration !== producerGenerationRef.current
        || !enabledRef.current
        || !isPlayingRef.current
      ) return;
      const schedule = activeScheduleRef.current ?? buildPolygonSchedule({
        layers: layersRef.current,
        beatsPerMeasure: beatsPerMeasureRef.current,
      });
      activeScheduleRef.current = schedule;
      const absbeat = absoluteBeatRef.current++;
      runnerRef.current?.scheduleBeat({
        sessionId: sessionIdRef.current,
        schedule,
        absoluteBeat: absbeat,
        bpm: bpmRef.current,
      });
    };

    return () => {
      // enabled가 false로 바뀌거나 unmount 시 핸들러 해제 + 대기 타이머 정리
      p.engineBeatCallbackRef.current = null;
      runnerRef.current?.cancelSession(sessionIdRef.current);
      sessionIdRef.current += 1;
      if (producerGenerationRef.current === producerGeneration) {
        producerGenerationRef.current += 1;
      }
      enabledRef.current = false;
      isPlayingRef.current = false;
    };
  // enabled가 변경될 때만 핸들러를 재등록한다.
  // layers/bpm/beatsPerMeasure/ensurePCM은 ref로 읽으므로 의존성 불필요.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.enabled, p.isPlaying, p.engineBeatCallbackRef]);

  // ── 레이어 관리 ─────────────────────────────────────────────────────────

  const handleAddLayer = useCallback(() => {
    const id = Crypto.randomUUID();
    const colorIdx = layers.length % LAYER_COLORS.length;
    const newSides = layers.length === 0 ? 4 : Math.max(3, (layers[layers.length - 1]?.sides ?? 4) - 1);
    const newLayer: PolygonLayer = {
      ...DEFAULT_POLYGON_LAYER,
      id,
      color: LAYER_COLORS[colorIdx],
      sides: newSides,
      volume: 1.0,
      offsets: [],
      beatTypes: [], // 빈 배열 = 모든 꼭짓점 normal (mute 없음)
    };
    setLayers((prev) => [...prev, newLayer]);
    layersRef.current = [...layersRef.current, newLayer];
    replaceActivePlaybackPlan(layersRef.current);
    setEditingLayerId(id);
    ensurePCM(newLayer.soundSet);
  }, [layers, ensurePCM, replaceActivePlaybackPlan]);

  const handleDeleteLayer = useCallback((id: string) => {
    runnerRef.current?.cancelLayer(sessionIdRef.current, id);
    // layersRef를 즉시 갱신 — effect 실행 전에 엔진 비트가 오면 삭제된
    // 레이어를 다시 읽어 슬롯을 재예약하는 경쟁 조건 방지
    layersRef.current = layersRef.current.filter((l) => l.id !== id);
    replaceActivePlaybackPlan(layersRef.current);
    setLayers(layersRef.current);
    setEditingLayerId((prev) => (prev === id ? null : prev));
    setActiveVertices((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [replaceActivePlaybackPlan]);

  /**
   * 레이어 배열을 변환하고 layersRef와 state를 동시에 갱신한다.
   * setLayers의 updater와 달리 ref를 즉시 갱신하므로,
   * React effect 실행 전에 엔진 비트가 와도 최신 배열을 읽는다.
   */
  const applyLayerMutation = useCallback(
    (transform: (prev: PolygonLayer[]) => PolygonLayer[]) => {
      const next = transform(layersRef.current);
      layersRef.current = next;
      replaceActivePlaybackPlan(next);
      setLayers(next);
    },
    [replaceActivePlaybackPlan],
  );

  const handleUpdateLayer = useCallback(
    (id: string, patch: Partial<PolygonLayer>) => {
      // 재생 중 편집: 옛 데이터로 예약된 이 레이어의 잔여 이벤트를 취소.
      // 남은 비트는 침묵하고 다음 비트부터 새 설정으로 발화한다.
      runnerRef.current?.cancelLayer(sessionIdRef.current, id);
      applyLayerMutation((prev) =>
        prev.map((l) => {
          if (l.id !== id) return l;
          const updated = { ...l, ...patch };
          if (patch.sides !== undefined && patch.sides !== l.sides) {
            const newSides = Math.max(1, patch.sides);
            // 같은 패치로 전달된 offsets/beatTypes를 우선 사용 (updated 기준)
            updated.offsets = Array.from({ length: newSides }, (_, i) => updated.offsets[i] ?? 0);
            // beatTypes도 새 변 수에 맞게 조정 (기존 값 유지, 새 꼭짓점은 normal)
            updated.beatTypes = Array.from(
              { length: newSides },
              (_, i) => updated.beatTypes[i] ?? "normal",
            );
          }
          // role이 변경되면 모든 꼭짓점의 beatType을 해당 role에 맞게 초기화한다.
          // 이렇게 해야 PolygonLayerEditor의 High/Low/Strong 셀렉터가 오디오에 반영된다.
          // role: "high" → accent, "strong" → strong, "low" → normal
          if (patch.role !== undefined) {
            const bt: VertexBeatType =
              patch.role === "strong" ? "strong"
              : patch.role === "high"   ? "accent"
              : "normal";
            updated.beatTypes = Array.from(
              { length: Math.max(1, updated.sides) },
              () => bt,
            );
          }
          return updated;
        }),
      );
      if (patch.soundSet) ensurePCM(patch.soundSet);
    },
    [ensurePCM, applyLayerMutation],
  );

  const handleSetOffset = useCallback(
    (layerId: string, vertexIdx: number, offset: number) => {
      runnerRef.current?.cancelLayer(sessionIdRef.current, layerId);
      applyLayerMutation((prev) =>
        prev.map((l) => {
          if (l.id !== layerId) return l;
          const newOffsets = [...l.offsets];
          newOffsets[vertexIdx] = Math.max(0, Math.min(0.5, offset));
          return { ...l, offsets: newOffsets };
        }),
      );
    },
    [applyLayerMutation],
  );

  // ── 꼭짓점 강세 순환 (S → A → N → M) ──────────────────────────────────
  const handleVertexBeatTypeCycle = useCallback(
    (layerId: string, vertexIdx: number) => {
      runnerRef.current?.cancelLayer(sessionIdRef.current, layerId);
      applyLayerMutation((prev) =>
        prev.map((l) => {
          if (l.id !== layerId) return l;
          const current = getVertexBeatType(l, vertexIdx);
          const newBeatTypes: VertexBeatType[] = Array.from(
            { length: Math.max(1, l.sides) },
            (_, i) => getVertexBeatType(l, i),
          );
          newBeatTypes[vertexIdx] = cycleVertexBeatType(current);
          return { ...l, beatTypes: newBeatTypes };
        }),
      );
    },
    [applyLayerMutation],
  );

  // ── 커스텀 사운드 등록 ──────────────────────────────────────────────────
  // 뷰에서 오디오 파일을 디코딩한 뒤 PCM과 레이어 ID를 넘기면
  // 훅 내부 캐시에 저장하고 해당 레이어의 soundSet을 갱신한다.
  const setLayerCustomSound = useCallback(
    (layerId: string, pcms: ClickPCMs) => {
      const customKey = `custom-${layerId}`;
      polygonPCMCacheRef.current.set(customKey, pcms);
      handleUpdateLayer(layerId, { soundSet: customKey });
    },
    [handleUpdateLayer],
  );

  return {
    layers,
    editingLayerId,
    setEditingLayerId,
    activeVertices,
    offsetPopup,
    setOffsetPopup,
    handleAddLayer,
    handleDeleteLayer,
    handleUpdateLayer,
    handleSetOffset,
    handleVertexBeatTypeCycle,
    setLayerCustomSound,
  };
}
