import { useEffect, useMemo, useRef } from "react";
import { useAudioPlayer } from "expo-audio";
import type { AudioPlayer as ExpoAudioPlayer } from "expo-audio";
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

/**
 * Builtin sound-set audio player pool.
 * 8 sets × 3 roles × 4 instances = 96 players.
 *
 * Increased from the original A/B (2 instances) to A/B/C/D (4 instances) to
 * prevent cut-off at high BPM + multiple subdivisions. At 300 BPM × 4
 * subdivisions the hit interval is ~50 ms, which is shorter than a typical
 * 120 ms click sample. Four instances guarantee no slot is reused before it
 * finishes playing. Toggle refs are now 0-based number indices (round-robin)
 * instead of booleans.
 *
 * Hook order is unconditional and stable so this is a safe extraction.
 */
export function useAudioPlayers(soundSet: SoundSet): AudioPlayersHook {
  const classicHighA = useAudioPlayer(soundSets.classic.high);
  const classicHighB = useAudioPlayer(soundSets.classic.high);
  const classicHighC = useAudioPlayer(soundSets.classic.high);
  const classicHighD = useAudioPlayer(soundSets.classic.high);
  const classicLowA = useAudioPlayer(soundSets.classic.low);
  const classicLowB = useAudioPlayer(soundSets.classic.low);
  const classicLowC = useAudioPlayer(soundSets.classic.low);
  const classicLowD = useAudioPlayer(soundSets.classic.low);
  const classicStrongA = useAudioPlayer(soundSets.classic.strong);
  const classicStrongB = useAudioPlayer(soundSets.classic.strong);
  const classicStrongC = useAudioPlayer(soundSets.classic.strong);
  const classicStrongD = useAudioPlayer(soundSets.classic.strong);

  const woodblockHighA = useAudioPlayer(soundSets.woodblock.high);
  const woodblockHighB = useAudioPlayer(soundSets.woodblock.high);
  const woodblockHighC = useAudioPlayer(soundSets.woodblock.high);
  const woodblockHighD = useAudioPlayer(soundSets.woodblock.high);
  const woodblockLowA = useAudioPlayer(soundSets.woodblock.low);
  const woodblockLowB = useAudioPlayer(soundSets.woodblock.low);
  const woodblockLowC = useAudioPlayer(soundSets.woodblock.low);
  const woodblockLowD = useAudioPlayer(soundSets.woodblock.low);
  const woodblockStrongA = useAudioPlayer(soundSets.woodblock.strong);
  const woodblockStrongB = useAudioPlayer(soundSets.woodblock.strong);
  const woodblockStrongC = useAudioPlayer(soundSets.woodblock.strong);
  const woodblockStrongD = useAudioPlayer(soundSets.woodblock.strong);

  const cowbellHighA = useAudioPlayer(soundSets.cowbell.high);
  const cowbellHighB = useAudioPlayer(soundSets.cowbell.high);
  const cowbellHighC = useAudioPlayer(soundSets.cowbell.high);
  const cowbellHighD = useAudioPlayer(soundSets.cowbell.high);
  const cowbellLowA = useAudioPlayer(soundSets.cowbell.low);
  const cowbellLowB = useAudioPlayer(soundSets.cowbell.low);
  const cowbellLowC = useAudioPlayer(soundSets.cowbell.low);
  const cowbellLowD = useAudioPlayer(soundSets.cowbell.low);
  const cowbellStrongA = useAudioPlayer(soundSets.cowbell.strong);
  const cowbellStrongB = useAudioPlayer(soundSets.cowbell.strong);
  const cowbellStrongC = useAudioPlayer(soundSets.cowbell.strong);
  const cowbellStrongD = useAudioPlayer(soundSets.cowbell.strong);

  const digitalHighA = useAudioPlayer(soundSets.digital.high);
  const digitalHighB = useAudioPlayer(soundSets.digital.high);
  const digitalHighC = useAudioPlayer(soundSets.digital.high);
  const digitalHighD = useAudioPlayer(soundSets.digital.high);
  const digitalLowA = useAudioPlayer(soundSets.digital.low);
  const digitalLowB = useAudioPlayer(soundSets.digital.low);
  const digitalLowC = useAudioPlayer(soundSets.digital.low);
  const digitalLowD = useAudioPlayer(soundSets.digital.low);
  const digitalStrongA = useAudioPlayer(soundSets.digital.strong);
  const digitalStrongB = useAudioPlayer(soundSets.digital.strong);
  const digitalStrongC = useAudioPlayer(soundSets.digital.strong);
  const digitalStrongD = useAudioPlayer(soundSets.digital.strong);

  const rimshotHighA = useAudioPlayer(soundSets.rimshot.high);
  const rimshotHighB = useAudioPlayer(soundSets.rimshot.high);
  const rimshotHighC = useAudioPlayer(soundSets.rimshot.high);
  const rimshotHighD = useAudioPlayer(soundSets.rimshot.high);
  const rimshotLowA = useAudioPlayer(soundSets.rimshot.low);
  const rimshotLowB = useAudioPlayer(soundSets.rimshot.low);
  const rimshotLowC = useAudioPlayer(soundSets.rimshot.low);
  const rimshotLowD = useAudioPlayer(soundSets.rimshot.low);
  const rimshotStrongA = useAudioPlayer(soundSets.rimshot.strong);
  const rimshotStrongB = useAudioPlayer(soundSets.rimshot.strong);
  const rimshotStrongC = useAudioPlayer(soundSets.rimshot.strong);
  const rimshotStrongD = useAudioPlayer(soundSets.rimshot.strong);

  const triangleHighA = useAudioPlayer(soundSets.triangle.high);
  const triangleHighB = useAudioPlayer(soundSets.triangle.high);
  const triangleHighC = useAudioPlayer(soundSets.triangle.high);
  const triangleHighD = useAudioPlayer(soundSets.triangle.high);
  const triangleLowA = useAudioPlayer(soundSets.triangle.low);
  const triangleLowB = useAudioPlayer(soundSets.triangle.low);
  const triangleLowC = useAudioPlayer(soundSets.triangle.low);
  const triangleLowD = useAudioPlayer(soundSets.triangle.low);
  const triangleStrongA = useAudioPlayer(soundSets.triangle.strong);
  const triangleStrongB = useAudioPlayer(soundSets.triangle.strong);
  const triangleStrongC = useAudioPlayer(soundSets.triangle.strong);
  const triangleStrongD = useAudioPlayer(soundSets.triangle.strong);

  const hihatHighA = useAudioPlayer(soundSets.hihat.high);
  const hihatHighB = useAudioPlayer(soundSets.hihat.high);
  const hihatHighC = useAudioPlayer(soundSets.hihat.high);
  const hihatHighD = useAudioPlayer(soundSets.hihat.high);
  const hihatLowA = useAudioPlayer(soundSets.hihat.low);
  const hihatLowB = useAudioPlayer(soundSets.hihat.low);
  const hihatLowC = useAudioPlayer(soundSets.hihat.low);
  const hihatLowD = useAudioPlayer(soundSets.hihat.low);
  const hihatStrongA = useAudioPlayer(soundSets.hihat.strong);
  const hihatStrongB = useAudioPlayer(soundSets.hihat.strong);
  const hihatStrongC = useAudioPlayer(soundSets.hihat.strong);
  const hihatStrongD = useAudioPlayer(soundSets.hihat.strong);

  const jamblockHighA = useAudioPlayer(soundSets.jamblock.high);
  const jamblockHighB = useAudioPlayer(soundSets.jamblock.high);
  const jamblockHighC = useAudioPlayer(soundSets.jamblock.high);
  const jamblockHighD = useAudioPlayer(soundSets.jamblock.high);
  const jamblockLowA = useAudioPlayer(soundSets.jamblock.low);
  const jamblockLowB = useAudioPlayer(soundSets.jamblock.low);
  const jamblockLowC = useAudioPlayer(soundSets.jamblock.low);
  const jamblockLowD = useAudioPlayer(soundSets.jamblock.low);
  const jamblockStrongA = useAudioPlayer(soundSets.jamblock.strong);
  const jamblockStrongB = useAudioPlayer(soundSets.jamblock.strong);
  const jamblockStrongC = useAudioPlayer(soundSets.jamblock.strong);
  const jamblockStrongD = useAudioPlayer(soundSets.jamblock.strong);

  const allPlayers = useMemo<BuiltinPlayers>(() => ({
    classic: { highA: classicHighA, highB: classicHighB, highC: classicHighC, highD: classicHighD, lowA: classicLowA, lowB: classicLowB, lowC: classicLowC, lowD: classicLowD, strongA: classicStrongA, strongB: classicStrongB, strongC: classicStrongC, strongD: classicStrongD },
    woodblock: { highA: woodblockHighA, highB: woodblockHighB, highC: woodblockHighC, highD: woodblockHighD, lowA: woodblockLowA, lowB: woodblockLowB, lowC: woodblockLowC, lowD: woodblockLowD, strongA: woodblockStrongA, strongB: woodblockStrongB, strongC: woodblockStrongC, strongD: woodblockStrongD },
    cowbell: { highA: cowbellHighA, highB: cowbellHighB, highC: cowbellHighC, highD: cowbellHighD, lowA: cowbellLowA, lowB: cowbellLowB, lowC: cowbellLowC, lowD: cowbellLowD, strongA: cowbellStrongA, strongB: cowbellStrongB, strongC: cowbellStrongC, strongD: cowbellStrongD },
    digital: { highA: digitalHighA, highB: digitalHighB, highC: digitalHighC, highD: digitalHighD, lowA: digitalLowA, lowB: digitalLowB, lowC: digitalLowC, lowD: digitalLowD, strongA: digitalStrongA, strongB: digitalStrongB, strongC: digitalStrongC, strongD: digitalStrongD },
    rimshot: { highA: rimshotHighA, highB: rimshotHighB, highC: rimshotHighC, highD: rimshotHighD, lowA: rimshotLowA, lowB: rimshotLowB, lowC: rimshotLowC, lowD: rimshotLowD, strongA: rimshotStrongA, strongB: rimshotStrongB, strongC: rimshotStrongC, strongD: rimshotStrongD },
    triangle: { highA: triangleHighA, highB: triangleHighB, highC: triangleHighC, highD: triangleHighD, lowA: triangleLowA, lowB: triangleLowB, lowC: triangleLowC, lowD: triangleLowD, strongA: triangleStrongA, strongB: triangleStrongB, strongC: triangleStrongC, strongD: triangleStrongD },
    hihat: { highA: hihatHighA, highB: hihatHighB, highC: hihatHighC, highD: hihatHighD, lowA: hihatLowA, lowB: hihatLowB, lowC: hihatLowC, lowD: hihatLowD, strongA: hihatStrongA, strongB: hihatStrongB, strongC: hihatStrongC, strongD: hihatStrongD },
    jamblock: { highA: jamblockHighA, highB: jamblockHighB, highC: jamblockHighC, highD: jamblockHighD, lowA: jamblockLowA, lowB: jamblockLowB, lowC: jamblockLowC, lowD: jamblockLowD, strongA: jamblockStrongA, strongB: jamblockStrongB, strongC: jamblockStrongC, strongD: jamblockStrongD },
  }), [
    classicHighA, classicHighB, classicHighC, classicHighD, classicLowA, classicLowB, classicLowC, classicLowD, classicStrongA, classicStrongB, classicStrongC, classicStrongD,
    woodblockHighA, woodblockHighB, woodblockHighC, woodblockHighD, woodblockLowA, woodblockLowB, woodblockLowC, woodblockLowD, woodblockStrongA, woodblockStrongB, woodblockStrongC, woodblockStrongD,
    cowbellHighA, cowbellHighB, cowbellHighC, cowbellHighD, cowbellLowA, cowbellLowB, cowbellLowC, cowbellLowD, cowbellStrongA, cowbellStrongB, cowbellStrongC, cowbellStrongD,
    digitalHighA, digitalHighB, digitalHighC, digitalHighD, digitalLowA, digitalLowB, digitalLowC, digitalLowD, digitalStrongA, digitalStrongB, digitalStrongC, digitalStrongD,
    rimshotHighA, rimshotHighB, rimshotHighC, rimshotHighD, rimshotLowA, rimshotLowB, rimshotLowC, rimshotLowD, rimshotStrongA, rimshotStrongB, rimshotStrongC, rimshotStrongD,
    triangleHighA, triangleHighB, triangleHighC, triangleHighD, triangleLowA, triangleLowB, triangleLowC, triangleLowD, triangleStrongA, triangleStrongB, triangleStrongC, triangleStrongD,
    hihatHighA, hihatHighB, hihatHighC, hihatHighD, hihatLowA, hihatLowB, hihatLowC, hihatLowD, hihatStrongA, hihatStrongB, hihatStrongC, hihatStrongD,
    jamblockHighA, jamblockHighB, jamblockHighC, jamblockHighD, jamblockLowA, jamblockLowB, jamblockLowC, jamblockLowD, jamblockStrongA, jamblockStrongB, jamblockStrongC, jamblockStrongD,
  ]);

  const highToggle = useRef(0);
  const lowToggle = useRef(0);
  const strongToggle = useRef(0);
  const soundSetRef = useRef<SoundSet>(soundSet);
  useEffect(() => { soundSetRef.current = soundSet; }, [soundSet]);
  const allPlayersRef = useRef<BuiltinPlayers>(allPlayers);
  useEffect(() => { allPlayersRef.current = allPlayers; }, [allPlayers]);

  return { allPlayers, allPlayersRef, soundSetRef, highToggle, lowToggle, strongToggle };
}
