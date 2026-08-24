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
import { safePlay, safePlayWithVolume } from "@/lib/audio-utils";
import { captureBreadcrumb } from "@/lib/error-tracking";
import {
  getWebAudioContext,
  scheduleWebClickAt,
  type ScheduledWebAudio,
} from "@/lib/audio-renderer";
import type { BuiltinPlayers, SoundSetPlayers } from "@/hooks/useAudioPlayers";
import type { ClickPCMs } from "@/lib/audio-renderer";
import type { SoundSet } from "@/lib/storage";
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

// ─────────────────────────────────────────────────────────────────────────────
// Web PCM 재생 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

function playPCMOnWeb(
  pcm: Float32Array,
  volume: number,
  when: number,
): ScheduledWebAudio | null {
  const ctx = getWebAudioContext();
  if (!ctx) return null;
  const buf = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
  buf.getChannelData(0).set(pcm);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(2, volume));
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(Math.max(ctx.currentTime, when));
  let cancelled = false;
  let endedListener: (() => void) | null = null;
  src.onended = () => {
    endedListener?.();
    try { src.disconnect(); } catch {}
    try { gain.disconnect(); } catch {}
  };
  return {
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      try { src.stop(); } catch {}
      try { src.disconnect(); } catch {}
      try { gain.disconnect(); } catch {}
    },
    onEnded: (listener) => { endedListener = listener; },
  };
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
  useEffect(() => { enabledRef.current = p.enabled; }, [p.enabled]);

  // ── 절대 비트 카운터 (엔진 콜백 내에서만 변경) ──────────────────────────
  const absoluteBeatRef = useRef(0);

  // ── Native 플레이어 풀 round-robin: soundSet+beatType 조합별 toggle 카운터 ──
  const polygonToggleRef = useRef<Record<string, number>>({});

  // ── 오프셋 setTimeout 핸들 ───────────────────────────────────────────────
  // Map<layerId, Set<timerId>>: 레이어별로 관리해 삭제 시 해당 레이어 타이머만 취소.
  const pendingTimerMapRef = useRef<Map<string, Set<ReturnType<typeof setTimeout>>>>(new Map());
  // Web Audio sources are scheduled on the AudioContext clock and must be
  // cancelled separately from the UI timers used for vertex pulses.
  const pendingAudioMapRef = useRef<Map<string, Set<ScheduledWebAudio>>>(new Map());
  const audioNeedsRescheduleAllRef = useRef(true);
  const audioNeedsRescheduleLayersRef = useRef<Set<string>>(new Set());
  const audioMeasureStartTimeRef = useRef<number | null>(null);
  const audioMeasureDurationSecRef = useRef(0);

  /** 특정 레이어의 대기 중 타이머를 모두 취소한다 */
  const clearLayerTimers = useCallback((layerId: string) => {
    const timers = pendingTimerMapRef.current.get(layerId);
    if (timers) {
      timers.forEach(clearTimeout);
      pendingTimerMapRef.current.delete(layerId);
    }
  }, []);

  /** 모든 레이어의 대기 중 타이머를 취소한다 (전역 cleanup 전용) */
  const clearPendingTimers = useCallback(() => {
    pendingTimerMapRef.current.forEach((timers) => timers.forEach(clearTimeout));
    pendingTimerMapRef.current.clear();
  }, []);

  const clearLayerAudio = useCallback((layerId: string) => {
    const sources = pendingAudioMapRef.current.get(layerId);
    if (sources) {
      sources.forEach((source) => source.cancel());
      pendingAudioMapRef.current.delete(layerId);
    }
  }, []);

  const clearPendingAudio = useCallback(() => {
    pendingAudioMapRef.current.forEach((sources) => sources.forEach((source) => source.cancel()));
    pendingAudioMapRef.current.clear();
  }, []);

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

  // enabled=true 시 / 레이어 사운드셋 변경 시 PCM 선제 로드
  useEffect(() => {
    if (!p.enabled || Platform.OS !== "web") return;
    layers.forEach((l) => ensurePCM(l.soundSet));
  }, [p.enabled, layers, ensurePCM]);

  // ── ensurePCM ref — 엔진 핸들러가 참조 변경에 영향받지 않도록 ref로 접근 ──
  // (getClickPCMs → ensurePCM 참조가 바뀌어도 핸들러 재등록이 일어나지 않는다)
  const ensurePCMRef = useRef(ensurePCM);
  useEffect(() => { ensurePCMRef.current = ensurePCM; }, [ensurePCM]);

  // ── 재생 중단 → absoluteBeat 리셋 ──────────────────────────────────────
  // 엔진이 멈추면 더 이상 콜백이 오지 않으므로 카운터만 초기화한다.
  // 비주얼 리셋(setActiveVertices)은 enabled가 false가 될 때 처리한다.
  useEffect(() => {
    if (!p.isPlaying) {
      clearPendingTimers();
      clearPendingAudio();
      audioNeedsRescheduleAllRef.current = true;
      audioNeedsRescheduleLayersRef.current.clear();
      audioMeasureStartTimeRef.current = null;
      audioMeasureDurationSecRef.current = 0;
      absoluteBeatRef.current = 0;
    }
  }, [p.isPlaying, clearPendingTimers, clearPendingAudio]);

  // ── BPM 변경 → 예약된 슬롯 취소 (다음 비트부터 새 BPM 적용) ────────────
  // BPM이 바뀌면 현재 마디에서 아직 발화되지 않은 슬롯을 취소한다.
  // 엔진이 다음 비트 콜백을 보낼 때 새 BPM 기준으로 재예약된다.
  const prevBpmRef = useRef(p.bpm);
  useEffect(() => {
    if (prevBpmRef.current !== p.bpm) {
      prevBpmRef.current = p.bpm;
      bpmRef.current = p.bpm;
      clearPendingTimers();
      clearPendingAudio();
      audioNeedsRescheduleAllRef.current = true;
      audioMeasureStartTimeRef.current = null;
      audioMeasureDurationSecRef.current = 0;
    }
  }, [p.bpm, clearPendingTimers, clearPendingAudio]);

  // ── 박자표 변경 → 위상 재정렬 ──────────────────────────────────────────
  // 엔진이 자체 비트 카운터를 0으로 리셋하므로, 폴리곤도 다음 콜백을
  // 마디 시작(beat 0)으로 인식하도록 절대 비트 카운터를 리셋한다.
  // 옛 타이밍으로 예약된 현재 비트 구간의 잔여 타이머도 취소한다.
  const prevMeterRef = useRef(p.beatsPerMeasure);
  useEffect(() => {
    if (prevMeterRef.current !== p.beatsPerMeasure) {
      prevMeterRef.current = p.beatsPerMeasure;
      beatsPerMeasureRef.current = p.beatsPerMeasure;
      clearPendingTimers();
      clearPendingAudio();
      audioNeedsRescheduleAllRef.current = true;
      audioMeasureStartTimeRef.current = null;
      audioMeasureDurationSecRef.current = 0;
      absoluteBeatRef.current = 0;
    }
  }, [p.beatsPerMeasure, clearPendingTimers, clearPendingAudio]);

  // ── 엔진 비트 핸들러 등록/해제 ──────────────────────────────────────────
  // 웹에서는 마디의 슬롯을 AudioContext 시간축에 직접 예약한다. UI 꼭짓점
  // 갱신만 짧은 JS 타이머를 사용하므로, 메인 스레드 지연이 오디오 리듬을 흔들지 않는다.
  // 네이티브 플레이어는 미래 시점 재생 API가 없어 기존 엔진-비트 기준 재생을 유지한다.
  useEffect(() => {
    if (!p.enabled) {
      // 엔진 콜백 해제 및 재생 상태 초기화.
      // 레이어 설정(layers, editingLayerId)은 보존한다:
      // 사용자가 폴리곤 모드를 닫았다 다시 열어도 설정한 레이어가 남아 있어야 한다.
      p.engineBeatCallbackRef.current = null;
      clearPendingTimers();
      clearPendingAudio();
      audioNeedsRescheduleAllRef.current = true;
      audioNeedsRescheduleLayersRef.current.clear();
      audioMeasureStartTimeRef.current = null;
      audioMeasureDurationSecRef.current = 0;
      absoluteBeatRef.current = 0;
      setOffsetPopup(null);
      setActiveVertices({});
      return;
    }

    audioNeedsRescheduleAllRef.current = true;

    // Native 사운드 재생 헬퍼 — 웹은 scheduleWebSound에서 AudioContext에 예약한다.
    const playNativeSound = (layer: PolygonLayer, beatType: Exclude<VertexBeatType, "mute">) => {
      // layer.volume (0-1)를 전역 볼륨에 곱해 레이어별 음량을 제어한다.
      const layerVol = Math.max(0, Math.min(1, layer.volume ?? 1.0));
      const soundRole = beatType === "strong" ? "strong" : beatType === "accent" ? "high" : "low";
      try {
        const players =
          p.allPlayersRef.current[layer.soundSet as keyof BuiltinPlayers]
          ?? p.allPlayersRef.current.classic;
        const pool = players as SoundSetPlayers;
        // 같은 sound-set과 강세를 쓰는 레이어가 동시에 발화할 때
        // 서로 다른 슬롯을 선택해 겹침 재생을 지원한다.
        const toggleKey = `${layer.soundSet}:${soundRole}`;
        const idx = polygonToggleRef.current[toggleKey] ?? 0;
        polygonToggleRef.current[toggleKey] = (idx + 1) % 4; // BUILTIN_POOL_SIZE=4
        const player = soundRole === "strong"
          ? [pool.strongA, pool.strongB, pool.strongC, pool.strongD][idx]
          : soundRole === "high"
          ? [pool.highA, pool.highB, pool.highC, pool.highD][idx]
          : [pool.lowA, pool.lowB, pool.lowC, pool.lowD][idx];
        // 진단용 breadcrumb: 프로덕션 빌드에서도(Sentry DSN 설정 시) 남아
        // 레이어별로 실제 재생 호출이 계속 발생하는지 추적할 수 있다.
        // (멀티레이어 폴리리듬에서 특정 레이어만 침묵하는 버그의 근본 원인이
        // "JS가 더 이상 호출을 안 함"인지 "호출은 되는데 안 들림"인지 구분용.)
        captureBreadcrumb({
          category: "polygon.beat",
          message: `layer=${layer.id.slice(0, 8)} sides=${layer.sides} role=${soundRole} slot=${toggleKey}#${idx} hasPlayer=${!!player}`,
          level: "debug",
        });
        if (player) safePlayWithVolume(player, layerVol * p.volumeRef.current, "polygon.beat");
      } catch (e) {
        captureBreadcrumb({
          category: "polygon.beat",
          message: `layer=${layer.id.slice(0, 8)} playNativeSound threw`,
          level: "warning",
          data: { error: String(e) },
        });
      }
    };

    const scheduleWebSound = (
      layer: PolygonLayer,
      beatType: Exclude<VertexBeatType, "mute">,
      when: number,
    ): ScheduledWebAudio | null => {
      const layerVol = Math.max(0, Math.min(1, layer.volume ?? 1.0));
      const soundRole = beatType === "strong" ? "strong" : beatType === "accent" ? "high" : "low";
      const cached =
        polygonPCMCacheRef.current.get(layer.soundSet)
        ?? p.clickPCMCacheRef.current[layer.soundSet];
      if (cached) {
        return playPCMOnWeb(cached[soundRole], p.volumeRef.current * layerVol, when);
      }
      ensurePCMRef.current(layer.soundSet);
      return scheduleWebClickAt(soundRole, "both", p.volumeRef.current * layerVol, when);
    };

    const addScheduledAudio = (layerId: string, source: ScheduledWebAudio | null) => {
      if (!source) return;
      let sources = pendingAudioMapRef.current.get(layerId);
      if (!sources) {
        sources = new Set();
        pendingAudioMapRef.current.set(layerId, sources);
      }
      sources.add(source);
      source.onEnded?.(() => {
        sources?.delete(source);
        if (sources?.size === 0 && pendingAudioMapRef.current.get(layerId) === sources) {
          pendingAudioMapRef.current.delete(layerId);
        }
      });
    };

    p.engineBeatCallbackRef.current = () => {
      // 이 핸들러는 React lifecycle 밖(엔진 오디오 스레드)에서 호출된다.
      // 최신 레이어/BPM/박자표는 ref를 통해 읽는다.
      const layers = layersRef.current;
      const bpm = bpmRef.current;
      const beatsPerMeasure = Math.max(1, Math.floor(beatsPerMeasureRef.current || 4));
      const absbeat = absoluteBeatRef.current++;

      const beatWithinMeasure = absbeat % beatsPerMeasure;
      const beatDurationMs = 60000 / Math.max(20, bpm);
      const beatStartMs = beatWithinMeasure * beatDurationMs; // 마디 시작 기준

      // 웹: 새 마디는 전체 마디를 한 번에 예약한다. 편집·템포 변경 뒤에는
      // 다음 엔진 비트부터 아직 지나지 않은 슬롯만 새 시간축으로 예약한다.
      if (Platform.OS === "web") {
        const ctx = getWebAudioContext();
        const rescheduleAll =
          beatWithinMeasure === 0 || audioNeedsRescheduleAllRef.current;
        const requestedLayers = audioNeedsRescheduleLayersRef.current;
        if (ctx && (rescheduleAll || requestedLayers.size > 0)) {
          const measureDurationSec = (beatsPerMeasure * beatDurationMs) / 1000;
          let measureStartTime = audioMeasureStartTimeRef.current;
          if (audioNeedsRescheduleAllRef.current || measureStartTime === null) {
            // A changed configuration takes effect on this engine beat. This
            // deliberately reanchors once, then subsequent measures advance
            // from the AudioContext timeline instead of callback arrival time.
            measureStartTime = ctx.currentTime - beatStartMs / 1000;
          } else if (beatWithinMeasure === 0) {
            const predicted = measureStartTime + audioMeasureDurationSecRef.current;
            // An unusually delayed JS callback cannot schedule in the past.
            // Reanchor only in that recovery case; ordinary measures retain
            // one continuous AudioContext clock.
            measureStartTime = predicted < ctx.currentTime - 0.02
              ? ctx.currentTime
              : predicted;
          }
          audioMeasureStartTimeRef.current = measureStartTime;
          audioMeasureDurationSecRef.current = measureDurationSec;

          layers.forEach((layer) => {
            if (!rescheduleAll && !requestedLayers.has(layer.id)) return;
            const sides = Math.max(1, layer.sides);
            const slotDurationMs = (beatsPerMeasure * beatDurationMs) / sides;
            for (let k = 0; k < sides; k++) {
              const slotTimeMs = k * slotDurationMs;
              if (slotTimeMs < beatStartMs) continue;
              const beatType = getVertexBeatType(layer, k);
              if (beatType === "mute") continue;
              const offsetMs = (layer.offsets[k] ?? 0) * slotDurationMs;
              addScheduledAudio(
                layer.id,
                scheduleWebSound(layer, beatType, measureStartTime + (slotTimeMs + offsetMs) / 1000),
              );
            }
            requestedLayers.delete(layer.id);
          });
          audioNeedsRescheduleAllRef.current = false;
        }
      }

      layers.forEach((layer) => {
        const sides = Math.max(1, layer.sides);
        // N각형 슬롯 간격 = 마디 길이 / N
        const slotDurationMs = (beatsPerMeasure * beatDurationMs) / sides;

        const schedule = (delayMs: number, fn: () => void) => {
          if (delayMs <= 0) {
            fn();
            return;
          }
          if (!pendingTimerMapRef.current.has(layer.id)) {
            pendingTimerMapRef.current.set(layer.id, new Set());
          }
          const layerTimers = pendingTimerMapRef.current.get(layer.id)!;
          const t = setTimeout(() => {
            layerTimers.delete(t);
            fn();
          }, delayMs);
          layerTimers.add(t);
        };

        for (let k = 0; k < sides; k++) {
          const slotTimeMs = k * slotDurationMs;
          // 이 비트 구간에 속하는 슬롯만 예약한다.
          //
          // sides가 beatsPerMeasure의 약수가 아니면(3각형=3/4 등) slotDurationMs가
          // beatDurationMs로 딱 나누어떨어지지 않아 slotTimeMs/beatStartMs가 이진
          // 부동소수점으로 정확히 표현 안 되는 값이 된다. ms 단위 비교(slotTimeMs <
          // beatStartMs 등)를 쓰면 특정 bpm에서 슬롯 하나가 두 구간의 경계 오차 사이로
          // 영구히 빠지거나(매 마디 계속 그 슬롯만 무음) 반대로 중복 발화할 수 있다.
          // 대신 bpm(beatDurationMs)에 무관한 "몇 번째 메인비트에 속하는가" 비율로
          // 비교하면 이 오차가 사라진다.
          const slotBeatPos = (k * beatsPerMeasure) / sides;
          if (Math.floor(slotBeatPos + 1e-9) !== beatWithinMeasure) continue;

          const beatType = getVertexBeatType(layer, k);

          if (beatType === "mute") {
            // 뮤트 슬롯: 소리 없음 + 슬롯 시각에 비주얼도 끔 (주기는 유지)
            schedule(slotTimeMs - beatStartMs, () => {
              setActiveVertices((prev) => {
                if (!(layer.id in prev)) return prev;
                const next = { ...prev };
                delete next[layer.id];
                return next;
              });
            });
            continue;
          }

          // 꼭짓점별 오프셋: 해당 슬롯 간격의 비율(0~0.5)만큼 지연
          const delayMs =
            slotTimeMs - beatStartMs + (layer.offsets[k] ?? 0) * slotDurationMs;

          schedule(delayMs, () => {
            // 오디오 트리거를 먼저 실행해, 뒤이은 React 상태 갱신(재조정 비용)이
            // 같은 타이머 콜백 안에서 실제 재생 호출을 지연시키지 않게 한다.
            if (Platform.OS !== "web") playNativeSound(layer, beatType);
            setActiveVertices((prev) =>
              prev[layer.id] === k ? prev : { ...prev, [layer.id]: k },
            );
          });
        }
      });
    };

    return () => {
      // enabled가 false로 바뀌거나 unmount 시 핸들러 해제 + 대기 타이머 정리
      p.engineBeatCallbackRef.current = null;
      clearPendingTimers();
      clearPendingAudio();
      audioNeedsRescheduleAllRef.current = true;
      audioNeedsRescheduleLayersRef.current.clear();
      audioMeasureStartTimeRef.current = null;
      audioMeasureDurationSecRef.current = 0;
    };
  // enabled가 변경될 때만 핸들러를 재등록한다.
  // layers/bpm/beatsPerMeasure/ensurePCM은 ref로 읽으므로 의존성 불필요.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.enabled, p.engineBeatCallbackRef, clearPendingTimers, clearPendingAudio, clearLayerAudio]);

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
    audioNeedsRescheduleLayersRef.current.add(id);
    setEditingLayerId(id);
    ensurePCM(newLayer.soundSet);
  }, [layers, ensurePCM]);

  const handleDeleteLayer = useCallback((id: string) => {
    // 삭제 전 해당 레이어의 대기 중 타이머를 즉시 취소
    clearLayerTimers(id);
    clearLayerAudio(id);
    audioNeedsRescheduleLayersRef.current.delete(id);
    // layersRef를 즉시 갱신 — effect 실행 전에 엔진 비트가 오면 삭제된
    // 레이어를 다시 읽어 슬롯을 재예약하는 경쟁 조건 방지
    layersRef.current = layersRef.current.filter((l) => l.id !== id);
    setLayers(layersRef.current);
    setEditingLayerId((prev) => (prev === id ? null : prev));
    setActiveVertices((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [clearLayerTimers, clearLayerAudio]);

  /**
   * 레이어 배열을 변환하고 layersRef와 state를 동시에 갱신한다.
   * setLayers의 updater와 달리 ref를 즉시 갱신하므로,
   * React effect 실행 전에 엔진 비트가 와도 최신 배열을 읽는다.
   */
  const applyLayerMutation = useCallback(
    (transform: (prev: PolygonLayer[]) => PolygonLayer[]) => {
      const next = transform(layersRef.current);
      layersRef.current = next;
      setLayers(next);
    },
    [],
  );

  const handleUpdateLayer = useCallback(
    (id: string, patch: Partial<PolygonLayer>) => {
      // 재생 중 편집: 옛 데이터로 예약된 이 레이어의 잔여 이벤트를 취소.
      // 남은 비트는 침묵하고 다음 비트부터 새 설정으로 발화한다.
      clearLayerTimers(id);
      clearLayerAudio(id);
      audioNeedsRescheduleLayersRef.current.add(id);
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
    [ensurePCM, clearLayerTimers, clearLayerAudio, applyLayerMutation],
  );

  const handleSetOffset = useCallback(
    (layerId: string, vertexIdx: number, offset: number) => {
      clearLayerTimers(layerId);
      clearLayerAudio(layerId);
      audioNeedsRescheduleLayersRef.current.add(layerId);
      applyLayerMutation((prev) =>
        prev.map((l) => {
          if (l.id !== layerId) return l;
          const newOffsets = [...l.offsets];
          newOffsets[vertexIdx] = Math.max(0, Math.min(0.5, offset));
          return { ...l, offsets: newOffsets };
        }),
      );
    },
    [clearLayerTimers, clearLayerAudio, applyLayerMutation],
  );

  // ── 꼭짓점 강세 순환 (S → A → N → M) ──────────────────────────────────
  const handleVertexBeatTypeCycle = useCallback(
    (layerId: string, vertexIdx: number) => {
      clearLayerTimers(layerId);
      clearLayerAudio(layerId);
      audioNeedsRescheduleLayersRef.current.add(layerId);
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
    [clearLayerTimers, clearLayerAudio, applyLayerMutation],
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
