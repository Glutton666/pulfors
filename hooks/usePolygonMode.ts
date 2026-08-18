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
import { safePlay } from "@/lib/audio-utils";
import { playWebClick, getWebAudioContext } from "@/lib/audio-renderer";
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
  makeDefaultBeatTypes,
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
  /** 꼭짓점을 탭할 때마다 S → A → N → M 순환 */
  handleVertexBeatTypeCycle: (layerId: string, vertexIdx: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Web PCM 재생 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

function playPCMOnWeb(pcm: Float32Array, volume: number): void {
  const ctx = getWebAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const buf = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
  buf.getChannelData(0).set(pcm);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(2, volume));
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(0);
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

export function usePolygonMode(p: UsePolygonModeParams): UsePolygonModeResult {
  const [layers, setLayers] = useState<PolygonLayer[]>([
    {
      id: "default-0",
      sides: 4,
      color: LAYER_COLORS[0],
      soundSet: "classic",
      role: "high",
      offsets: [],
      beatTypes: makeDefaultBeatTypes(4),
    },
  ]);
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

  // ── Per-layer PCM 캐시 (전역 clickPCMCacheRef와 분리) ───────────────────
  const polygonPCMCacheRef = useRef<Map<string, ClickPCMs>>(new Map());
  const loadingRef = useRef<Set<string>>(new Set());

  const ensurePCM = useCallback(
    (soundSet: string) => {
      if (Platform.OS !== "web") return;
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
      absoluteBeatRef.current = 0;
    }
  }, [p.isPlaying, clearPendingTimers]);

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
      absoluteBeatRef.current = 0;
    }
  }, [p.beatsPerMeasure, clearPendingTimers]);

  // ── 엔진 비트 핸들러 등록/해제 ──────────────────────────────────────────
  // enabled=true이면 핸들러를 ref에 등록하고 엔진 콜백이 직접 호출한다.
  // enabled=false이면 ref를 null로 해제하고 비주얼 상태를 초기화한다.
  //
  // 폴리리듬 스케줄링 (비트별 슬롯 예약):
  // N각형은 한 마디(beatsPerMeasure × beatDuration)를 N등분해 발화한다.
  // 매 엔진 비트에서 "이 비트 구간 [beatStart, beatEnd)에 속하는 슬롯"만
  // 짧은 setTimeout으로 예약한다. 앵커가 항상 최신 엔진 비트이므로
  // 벽시계(Date.now()) 오차가 누적되지 않고, BPM 변경도 다음 비트부터
  // 자동 반영된다. (3각형+4각형 → 3:4 폴리리듬)
  useEffect(() => {
    if (!p.enabled) {
      p.engineBeatCallbackRef.current = null;
      clearPendingTimers();
      absoluteBeatRef.current = 0;
      setActiveVertices({});
      return;
    }

    // 사운드 재생 헬퍼 — 모든 가변 데이터는 ref를 통해 읽으므로
    // 이 클로저는 enabled가 바뀔 때까지 재생성되지 않는다.
    const playSound = (layer: PolygonLayer, beatType: Exclude<VertexBeatType, "mute">) => {
      try {
        if (Platform.OS === "web") {
          const cached =
            polygonPCMCacheRef.current.get(layer.soundSet)
            ?? p.clickPCMCacheRef.current[layer.soundSet];
          if (cached) {
            // beatType → PCM 선택
            const pcm: Float32Array =
              beatType === "strong" ? cached.strong
              : beatType === "accent" ? cached.high
              : cached.low; // "normal"
            playPCMOnWeb(pcm, p.volumeRef.current);
          } else {
            playWebClick(beatTypeToWebClickRole(beatType), "both");
            ensurePCMRef.current(layer.soundSet);
          }
        } else {
          // Native: sound-set + beatType 조합별 round-robin으로 플레이어 풀 순환
          const players =
            p.allPlayersRef.current[layer.soundSet as keyof BuiltinPlayers]
            ?? p.allPlayersRef.current.classic;
          const pool = players as SoundSetPlayers;
          // 같은 sound-set + beatType을 쓰는 레이어가 동일 시점에 발화할 때
          // 동일한 공유 풀에서 서로 다른 슬롯을 선택해 겹침 재생을 지원한다.
          const toggleKey = `${layer.soundSet}-${beatType}`;
          const idx = polygonToggleRef.current[toggleKey] ?? 0;
          polygonToggleRef.current[toggleKey] = (idx + 1) % 4; // BUILTIN_POOL_SIZE=4
          const player =
            beatType === "strong"
              ? [pool.strongA, pool.strongB, pool.strongC, pool.strongD][idx]
              : beatType === "accent"
              ? [pool.highA, pool.highB, pool.highC, pool.highD][idx]
              : [pool.lowA, pool.lowB, pool.lowC, pool.lowD][idx];
          if (player) safePlay(player, "polygon.beat");
        }
      } catch {}
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
      const beatEndMs = beatStartMs + beatDurationMs;

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
          // 이 비트 구간에 속하는 슬롯만 예약한다
          if (slotTimeMs < beatStartMs || slotTimeMs >= beatEndMs) continue;

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
            setActiveVertices((prev) =>
              prev[layer.id] === k ? prev : { ...prev, [layer.id]: k },
            );
            playSound(layer, beatType);
          });
        }
      });
    };

    return () => {
      // enabled가 false로 바뀌거나 unmount 시 핸들러 해제 + 대기 타이머 정리
      p.engineBeatCallbackRef.current = null;
      clearPendingTimers();
    };
  // enabled가 변경될 때만 핸들러를 재등록한다.
  // layers/bpm/beatsPerMeasure/ensurePCM은 ref로 읽으므로 의존성 불필요.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.enabled, p.engineBeatCallbackRef, clearPendingTimers]);

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
      offsets: [],
      beatTypes: makeDefaultBeatTypes(newSides),
    };
    setLayers((prev) => [...prev, newLayer]);
    setEditingLayerId(id);
    ensurePCM(newLayer.soundSet);
  }, [layers, ensurePCM]);

  const handleDeleteLayer = useCallback((id: string) => {
    // 삭제 전 해당 레이어의 대기 중 타이머를 즉시 취소
    clearLayerTimers(id);
    setLayers((prev) => prev.filter((l) => l.id !== id));
    setEditingLayerId((prev) => (prev === id ? null : prev));
    setActiveVertices((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [clearLayerTimers]);

  const handleUpdateLayer = useCallback(
    (id: string, patch: Partial<PolygonLayer>) => {
      // 재생 중 편집: 옛 데이터로 예약된 이 레이어의 잔여 이벤트를 취소.
      // 남은 마디는 침묵하고 다음 마디부터 새 설정으로 재스케줄된다.
      clearLayerTimers(id);
      setLayers((prev) =>
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
              (_, i) => updated.beatTypes[i] ?? (i === 0 ? "strong" : "normal"),
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
    [ensurePCM, clearLayerTimers],
  );

  const handleSetOffset = useCallback(
    (layerId: string, vertexIdx: number, offset: number) => {
      clearLayerTimers(layerId);
      setLayers((prev) =>
        prev.map((l) => {
          if (l.id !== layerId) return l;
          const newOffsets = [...l.offsets];
          newOffsets[vertexIdx] = Math.max(0, Math.min(0.5, offset));
          return { ...l, offsets: newOffsets };
        }),
      );
    },
    [clearLayerTimers],
  );

  // ── 꼭짓점 강세 순환 (S → A → N → M → S) ──────────────────────────────
  const handleVertexBeatTypeCycle = useCallback(
    (layerId: string, vertexIdx: number) => {
      clearLayerTimers(layerId);
      setLayers((prev) =>
        prev.map((l) => {
          if (l.id !== layerId) return l;
          const current = getVertexBeatType(l, vertexIdx);
          const next = cycleVertexBeatType(current);
          // beatTypes 배열을 sides 길이만큼 확장하고 해당 인덱스만 교체
          const newBeatTypes: VertexBeatType[] = Array.from(
            { length: Math.max(1, l.sides) },
            (_, i) => l.beatTypes[i] ?? (i === 0 ? "strong" : "normal"),
          );
          newBeatTypes[vertexIdx] = next;
          return { ...l, beatTypes: newBeatTypes };
        }),
      );
    },
    [clearLayerTimers],
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
  };
}
