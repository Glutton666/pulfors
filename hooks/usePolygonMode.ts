/**
 * usePolygonMode — 폴리곤 메트로놈 상태 및 오디오 훅 (v4)
 *
 * 설계 원칙:
 * - 비트 트리거는 엔진 오디오 콜백(engineBeatCallbackRef)을 통해 직접 구동된다.
 *   React state(currentBeat, measureCount) 의존 없음 → rAF 지터/마디 경계 이중 발화 없음.
 * - isPlaying은 재생 중단 시 상태 리셋 전용으로만 사용된다.
 * - enabled=false이면 핸들러를 ref에서 즉시 해제하고 상태를 초기화한다.
 * - 레이어 데이터는 layersRef를 통해 핸들러 내에서 항상 최신값을 읽는다.
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
  LAYER_COLORS,
  DEFAULT_POLYGON_LAYER,
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
  /** BPM (오프셋 타이밍 계산용) */
  bpm: number;
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

  const enabledRef = useRef(p.enabled);
  useEffect(() => { enabledRef.current = p.enabled; }, [p.enabled]);

  // ── 절대 비트 카운터 (엔진 콜백 내에서만 변경) ──────────────────────────
  const absoluteBeatRef = useRef(0);

  // ── Native 플레이어 풀 round-robin: layerId+role 조합별 toggle 카운터 ──
  const polygonToggleRef = useRef<Record<string, number>>({});

  // ── 오프셋 setTimeout 핸들 ───────────────────────────────────────────────
  // Set을 사용해 완료된 타이머를 O(1)로 제거하고 무한 성장을 방지한다.
  const pendingTimerSetRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const clearPendingTimers = useCallback(() => {
    pendingTimerSetRef.current.forEach(clearTimeout);
    pendingTimerSetRef.current.clear();
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

  // ── 재생 중단 → absoluteBeat 리셋 ──────────────────────────────────────
  // 엔진이 멈추면 더 이상 콜백이 오지 않으므로 카운터만 초기화한다.
  // 비주얼 리셋(setActiveVertices)은 enabled가 false가 될 때 처리한다.
  useEffect(() => {
    if (!p.isPlaying) {
      clearPendingTimers();
      absoluteBeatRef.current = 0;
    }
  }, [p.isPlaying, clearPendingTimers]);

  // ── 엔진 비트 핸들러 등록/해제 ──────────────────────────────────────────
  // enabled=true이면 핸들러를 ref에 등록하고 엔진 콜백이 직접 호출한다.
  // enabled=false이면 ref를 null로 해제하고 비주얼 상태를 초기화한다.
  useEffect(() => {
    if (!p.enabled) {
      p.engineBeatCallbackRef.current = null;
      clearPendingTimers();
      absoluteBeatRef.current = 0;
      setActiveVertices({});
      return;
    }

    p.engineBeatCallbackRef.current = () => {
      // 이 핸들러는 React lifecycle 밖(엔진 오디오 스레드)에서 호출된다.
      // 최신 레이어/BPM은 ref를 통해 읽는다.
      const layers = layersRef.current;
      const bpm = bpmRef.current;
      const absbeat = absoluteBeatRef.current++;
      const beatDurationMs = 60000 / Math.max(20, bpm);

      const newActiveVertices: Record<string, number> = {};

      layers.forEach((layer) => {
        const sides = Math.max(1, layer.sides);
        const vertexIdx = absbeat % sides;
        newActiveVertices[layer.id] = vertexIdx;

        const delayMs = (layer.offsets[vertexIdx] ?? 0) * beatDurationMs;

        const playSound = () => {
          try {
            if (Platform.OS === "web") {
              const cached =
                polygonPCMCacheRef.current.get(layer.soundSet)
                ?? p.clickPCMCacheRef.current[layer.soundSet];
              if (cached) {
                const pcm: Float32Array =
                  layer.role === "strong" ? cached.strong
                  : layer.role === "high"   ? cached.high
                  : cached.low;
                playPCMOnWeb(pcm, p.volumeRef.current);
              } else {
                playWebClick(layer.role, "both");
                ensurePCM(layer.soundSet);
              }
            } else {
              // Native: sound-set + role 조합별 round-robin으로 플레이어 풀 순환
              const players =
                p.allPlayersRef.current[layer.soundSet as keyof BuiltinPlayers]
                ?? p.allPlayersRef.current.classic;
              const pool = players as SoundSetPlayers;
              // 같은 sound-set + role을 쓰는 레이어가 동일 비트에 발화할 때
              // 동일한 공유 풀에서 서로 다른 슬롯을 선택해 겹침 재생을 지원한다.
              // 키를 layer.id 대신 soundSet+role로 설정해 풀 카운터를 공유한다.
              const toggleKey = `${layer.soundSet}-${layer.role}`;
              const idx = polygonToggleRef.current[toggleKey] ?? 0;
              polygonToggleRef.current[toggleKey] = (idx + 1) % 4; // BUILTIN_POOL_SIZE=4
              const player =
                layer.role === "strong"
                  ? [pool.strongA, pool.strongB, pool.strongC, pool.strongD][idx]
                  : layer.role === "high"
                  ? [pool.highA, pool.highB, pool.highC, pool.highD][idx]
                  : [pool.lowA, pool.lowB, pool.lowC, pool.lowD][idx];
              if (player) safePlay(player, "polygon.beat");
            }
          } catch {}
        };

        if (delayMs <= 0) {
          playSound();
        } else {
          const t = setTimeout(() => {
            pendingTimerSetRef.current.delete(t);
            playSound();
          }, delayMs);
          pendingTimerSetRef.current.add(t);
        }
      });

      // 비주얼 업데이트: React가 rAF 배치로 처리 (오디오와 독립)
      setActiveVertices(newActiveVertices);
    };

    return () => {
      // enabled가 false로 바뀌거나 unmount 시 핸들러 해제 + 대기 타이머 정리
      p.engineBeatCallbackRef.current = null;
      clearPendingTimers();
    };
  // enabled가 변경될 때만 핸들러를 재등록한다.
  // layers/bpm은 ref를 통해 항상 최신값을 읽으므로 의존성 불필요.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.enabled, p.engineBeatCallbackRef, clearPendingTimers, ensurePCM]);

  // ── 레이어 관리 ─────────────────────────────────────────────────────────

  const handleAddLayer = useCallback(() => {
    const id = Crypto.randomUUID();
    const colorIdx = layers.length % LAYER_COLORS.length;
    const newLayer: PolygonLayer = {
      ...DEFAULT_POLYGON_LAYER,
      id,
      color: LAYER_COLORS[colorIdx],
      sides: layers.length === 0 ? 4 : Math.max(3, (layers[layers.length - 1]?.sides ?? 4) - 1),
      offsets: [],
    };
    setLayers((prev) => [...prev, newLayer]);
    setEditingLayerId(id);
    ensurePCM(newLayer.soundSet);
  }, [layers, ensurePCM]);

  const handleDeleteLayer = useCallback((id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    setEditingLayerId((prev) => (prev === id ? null : prev));
    setActiveVertices((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleUpdateLayer = useCallback(
    (id: string, patch: Partial<PolygonLayer>) => {
      setLayers((prev) =>
        prev.map((l) => {
          if (l.id !== id) return l;
          const updated = { ...l, ...patch };
          if (patch.sides !== undefined && patch.sides !== l.sides) {
            const newSides = Math.max(1, patch.sides);
            updated.offsets = Array.from({ length: newSides }, (_, i) => l.offsets[i] ?? 0);
          }
          return updated;
        }),
      );
      if (patch.soundSet) ensurePCM(patch.soundSet);
    },
    [ensurePCM],
  );

  const handleSetOffset = useCallback(
    (layerId: string, vertexIdx: number, offset: number) => {
      setLayers((prev) =>
        prev.map((l) => {
          if (l.id !== layerId) return l;
          const newOffsets = [...l.offsets];
          newOffsets[vertexIdx] = Math.max(0, Math.min(0.5, offset));
          return { ...l, offsets: newOffsets };
        }),
      );
    },
    [],
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
  };
}
