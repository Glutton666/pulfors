import { useEffect, useMemo, useRef, useCallback } from "react";
import { createAudioPlayer } from "expo-audio";
import type { AudioPlayer as ExpoAudioPlayer, AudioSource } from "expo-audio";
import { soundSets } from "@/lib/metronome-engine";
import type { SoundSet } from "@/lib/storage";

/**
 * 빌트인 사운드셋 플레이어 풀 크기 (역할당 인스턴스 수).
 *
 * A/B 2-인스턴스 임계점 분석:
 *   hit 간격(ms) = 60000 / (BPM × subdivisions)
 *   필요 인스턴스 ≈ ceil(sampleDuration / hitInterval) + 1
 *
 *   샘플 평균 재생 길이 ~120ms 기준:
 *     pool=2 → 안전 hit 간격 ≥ 120ms → BPM×sub ≤ 500 (예: 125 BPM × 4sub)
 *     pool=3 → 안전 hit 간격 ≥ 60ms  → BPM×sub ≤ 1000 (예: 250 BPM × 4sub)
 *     pool=4 → 안전 hit 간격 ≥ 40ms  → BPM×sub ≤ 1500 (예: 300 BPM × 5sub)
 *
 *   앱 최대 BPM 300 × 최대 서브디비전 4 = 1200 → pool=4로 전 영역을 커버합니다.
 *   (같은 role이 매 틱마다 호출되지 않으므로 1 마진은 충분히 보수적입니다.)
 */
export const BUILTIN_POOL_SIZE = 4;

export interface SoundSetPlayers {
  highA: ExpoAudioPlayer;
  highB: ExpoAudioPlayer;
  highC: ExpoAudioPlayer;
  highD: ExpoAudioPlayer;
  lowA: ExpoAudioPlayer;
  lowB: ExpoAudioPlayer;
  lowC: ExpoAudioPlayer;
  lowD: ExpoAudioPlayer;
  strongA: ExpoAudioPlayer;
  strongB: ExpoAudioPlayer;
  strongC: ExpoAudioPlayer;
  strongD: ExpoAudioPlayer;
}

export type BuiltinPlayers = Record<keyof typeof soundSets, SoundSetPlayers>;

export interface AudioPlayersHook {
  allPlayers: BuiltinPlayers;
  allPlayersRef: React.MutableRefObject<BuiltinPlayers>;
  soundSetRef: React.MutableRefObject<SoundSet>;
  /** 0-based round-robin index for the "high" role (cycles 0→1→2→3→0…) */
  highToggle: React.MutableRefObject<number>;
  /** 0-based round-robin index for the "low" role */
  lowToggle: React.MutableRefObject<number>;
  /** 0-based round-robin index for the "strong" role */
  strongToggle: React.MutableRefObject<number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼 함수 (모듈 레벨 — 훅 외부)
// ─────────────────────────────────────────────────────────────────────────────

type SoundSetDef = { high: AudioSource; low: AudioSource; strong: AudioSource };

/**
 * 사운드셋 하나에 대해 역할 3 × 풀 4 = 12개 AudioPlayer를 즉석 생성한다.
 * createAudioPlayer는 동기 함수이므로 엔진 틱 콜백 내에서도 안전하게 호출할 수 있다.
 */
function makeSoundSetPlayers(def: SoundSetDef): SoundSetPlayers {
  const h = def.high;
  const l = def.low;
  const s = def.strong;
  return {
    highA: createAudioPlayer(h), highB: createAudioPlayer(h),
    highC: createAudioPlayer(h), highD: createAudioPlayer(h),
    lowA:  createAudioPlayer(l), lowB:  createAudioPlayer(l),
    lowC:  createAudioPlayer(l), lowD:  createAudioPlayer(l),
    strongA: createAudioPlayer(s), strongB: createAudioPlayer(s),
    strongC: createAudioPlayer(s), strongD: createAudioPlayer(s),
  };
}

/** 사운드셋 플레이어 12개를 모두 해제한다. */
function disposeSoundSetPlayers(players: SoundSetPlayers): void {
  for (const p of Object.values(players) as ExpoAudioPlayer[]) {
    try { p.remove(); } catch { /* 이미 해제된 경우 무시 */ }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 훅
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 빌트인 사운드셋 플레이어 풀 — 지연(lazy) 생성 + 캐시 방식.
 *
 * 이전 구현은 11개 사운드셋 × 3 역할 × 4 풀 = 132개 AudioPlayer를 앱 시작 시
 * 한꺼번에 useAudioPlayer() 훅으로 생성했다. Android AudioFlinger의 트랙 슬롯이
 * 이미 대부분 소진되어 새 트랙 할당(createTrack_l)이 -12(ENOMEM)으로 실패하고
 * 무음이 발생했다.
 *
 * 새 구현:
 *   - 실제 접근이 일어나는 시점에 createAudioPlayer()로 해당 세트만 생성한다.
 *   - 생성한 플레이어는 cacheRef(Map)에 보관해 이후 재사용한다.
 *   - 사운드셋을 바꾸면 useEffect가 새 세트를 미리(warm-up) 만들어 두어
 *     첫 틱에서 지연이 없다.
 *   - 보통 사용자는 12개, 레이어/블록에서 세트를 3개 쓰면 36개만 생성된다.
 *   - 언마운트 시 모든 캐시된 플레이어를 해제한다.
 *
 * allPlayers / allPlayersRef는 Proxy로 구현돼 기존 allPlayersRef.current[key]
 * 접근 패턴과 완전히 호환된다 — 호출부 변경 불필요.
 *
 * Hook order is unconditional and stable so this is a safe extraction.
 */
export function useAudioPlayers(soundSet: SoundSet): AudioPlayersHook {
  // soundset key → SoundSetPlayers 캐시
  const cacheRef = useRef<Map<string, SoundSetPlayers>>(new Map());

  /**
   * 캐시에서 플레이어를 가져오거나 없으면 즉석 생성한다.
   * 동기 함수 — 엔진 틱 콜백 내에서도 안전하게 호출할 수 있다.
   */
  const getOrCreate = useCallback((key: string): SoundSetPlayers | undefined => {
    const hit = cacheRef.current.get(key);
    if (hit) return hit;
    const def = soundSets[key as keyof typeof soundSets] as SoundSetDef | undefined;
    if (!def) return undefined;
    const players = makeSoundSetPlayers(def);
    cacheRef.current.set(key, players);
    return players;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // cacheRef는 ref이므로 의존성 배열에 불필요

  /**
   * allPlayers: Proxy를 통해 key 접근 시 지연 생성.
   * 기존 `allPlayersRef.current[soundSetKey].highA` 패턴과 완전 호환.
   */
  const allPlayers = useMemo<BuiltinPlayers>(
    () =>
      new Proxy({} as BuiltinPlayers, {
        get: (_t, prop: string) => getOrCreate(prop),
        has: (_t, prop: string) => prop in soundSets,
      }),
    [getOrCreate],
  );

  // Proxy 자체는 교체되지 않으므로 ref를 별도로 갱신할 필요 없다.
  const allPlayersRef = useRef<BuiltinPlayers>(allPlayers);

  const highToggle   = useRef(0);
  const lowToggle    = useRef(0);
  const strongToggle = useRef(0);
  const soundSetRef  = useRef<SoundSet>(soundSet);

  // soundSet 변경(또는 최초 마운트) 시:
  //   1. soundSetRef 동기화
  //   2. 새 세트를 미리 생성(warm-up) — 첫 틱에서 즉시 재생 가능
  useEffect(() => {
    soundSetRef.current = soundSet;
    getOrCreate(soundSet);
  }, [soundSet, getOrCreate]);

  // 언마운트 시 모든 캐시된 플레이어 해제
  useEffect(() => {
    return () => {
      for (const players of cacheRef.current.values()) {
        disposeSoundSetPlayers(players);
      }
      cacheRef.current.clear();
    };
  }, []);

  return { allPlayers, allPlayersRef, soundSetRef, highToggle, lowToggle, strongToggle };
}
