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
 * 11 sets × 3 roles × 4 instances = 132 players.
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

  const sineHighA = useAudioPlayer(soundSets.sine.high);
  const sineHighB = useAudioPlayer(soundSets.sine.high);
  const sineHighC = useAudioPlayer(soundSets.sine.high);
  const sineHighD = useAudioPlayer(soundSets.sine.high);
  const sineLowA = useAudioPlayer(soundSets.sine.low);
  const sineLowB = useAudioPlayer(soundSets.sine.low);
  const sineLowC = useAudioPlayer(soundSets.sine.low);
  const sineLowD = useAudioPlayer(soundSets.sine.low);
  const sineStrongA = useAudioPlayer(soundSets.sine.strong);
  const sineStrongB = useAudioPlayer(soundSets.sine.strong);
  const sineStrongC = useAudioPlayer(soundSets.sine.strong);
  const sineStrongD = useAudioPlayer(soundSets.sine.strong);

  const blipHighA = useAudioPlayer(soundSets.blip.high);
  const blipHighB = useAudioPlayer(soundSets.blip.high);
  const blipHighC = useAudioPlayer(soundSets.blip.high);
  const blipHighD = useAudioPlayer(soundSets.blip.high);
  const blipLowA = useAudioPlayer(soundSets.blip.low);
  const blipLowB = useAudioPlayer(soundSets.blip.low);
  const blipLowC = useAudioPlayer(soundSets.blip.low);
  const blipLowD = useAudioPlayer(soundSets.blip.low);
  const blipStrongA = useAudioPlayer(soundSets.blip.strong);
  const blipStrongB = useAudioPlayer(soundSets.blip.strong);
  const blipStrongC = useAudioPlayer(soundSets.blip.strong);
  const blipStrongD = useAudioPlayer(soundSets.blip.strong);

  const claveHighA = useAudioPlayer(soundSets.clave.high);
  const claveHighB = useAudioPlayer(soundSets.clave.high);
  const claveHighC = useAudioPlayer(soundSets.clave.high);
  const claveHighD = useAudioPlayer(soundSets.clave.high);
  const claveLowA = useAudioPlayer(soundSets.clave.low);
  const claveLowB = useAudioPlayer(soundSets.clave.low);
  const claveLowC = useAudioPlayer(soundSets.clave.low);
  const claveLowD = useAudioPlayer(soundSets.clave.low);
  const claveStrongA = useAudioPlayer(soundSets.clave.strong);
  const claveStrongB = useAudioPlayer(soundSets.clave.strong);
  const claveStrongC = useAudioPlayer(soundSets.clave.strong);
  const claveStrongD = useAudioPlayer(soundSets.clave.strong);

  const cajonHighA = useAudioPlayer(soundSets.cajon.high);
  const cajonHighB = useAudioPlayer(soundSets.cajon.high);
  const cajonHighC = useAudioPlayer(soundSets.cajon.high);
  const cajonHighD = useAudioPlayer(soundSets.cajon.high);
  const cajonLowA = useAudioPlayer(soundSets.cajon.low);
  const cajonLowB = useAudioPlayer(soundSets.cajon.low);
  const cajonLowC = useAudioPlayer(soundSets.cajon.low);
  const cajonLowD = useAudioPlayer(soundSets.cajon.low);
  const cajonStrongA = useAudioPlayer(soundSets.cajon.strong);
  const cajonStrongB = useAudioPlayer(soundSets.cajon.strong);
  const cajonStrongC = useAudioPlayer(soundSets.cajon.strong);
  const cajonStrongD = useAudioPlayer(soundSets.cajon.strong);

  const marimbaHighA = useAudioPlayer(soundSets.marimba.high);
  const marimbaHighB = useAudioPlayer(soundSets.marimba.high);
  const marimbaHighC = useAudioPlayer(soundSets.marimba.high);
  const marimbaHighD = useAudioPlayer(soundSets.marimba.high);
  const marimbaLowA = useAudioPlayer(soundSets.marimba.low);
  const marimbaLowB = useAudioPlayer(soundSets.marimba.low);
  const marimbaLowC = useAudioPlayer(soundSets.marimba.low);
  const marimbaLowD = useAudioPlayer(soundSets.marimba.low);
  const marimbaStrongA = useAudioPlayer(soundSets.marimba.strong);
  const marimbaStrongB = useAudioPlayer(soundSets.marimba.strong);
  const marimbaStrongC = useAudioPlayer(soundSets.marimba.strong);
  const marimbaStrongD = useAudioPlayer(soundSets.marimba.strong);

  const stickHighA = useAudioPlayer(soundSets.stick.high);
  const stickHighB = useAudioPlayer(soundSets.stick.high);
  const stickHighC = useAudioPlayer(soundSets.stick.high);
  const stickHighD = useAudioPlayer(soundSets.stick.high);
  const stickLowA = useAudioPlayer(soundSets.stick.low);
  const stickLowB = useAudioPlayer(soundSets.stick.low);
  const stickLowC = useAudioPlayer(soundSets.stick.low);
  const stickLowD = useAudioPlayer(soundSets.stick.low);
  const stickStrongA = useAudioPlayer(soundSets.stick.strong);
  const stickStrongB = useAudioPlayer(soundSets.stick.strong);
  const stickStrongC = useAudioPlayer(soundSets.stick.strong);
  const stickStrongD = useAudioPlayer(soundSets.stick.strong);

  const allPlayers = useMemo<BuiltinPlayers>(() => ({
    classic: { highA: classicHighA, highB: classicHighB, highC: classicHighC, highD: classicHighD, lowA: classicLowA, lowB: classicLowB, lowC: classicLowC, lowD: classicLowD, strongA: classicStrongA, strongB: classicStrongB, strongC: classicStrongC, strongD: classicStrongD },
    woodblock: { highA: woodblockHighA, highB: woodblockHighB, highC: woodblockHighC, highD: woodblockHighD, lowA: woodblockLowA, lowB: woodblockLowB, lowC: woodblockLowC, lowD: woodblockLowD, strongA: woodblockStrongA, strongB: woodblockStrongB, strongC: woodblockStrongC, strongD: woodblockStrongD },
    cowbell: { highA: cowbellHighA, highB: cowbellHighB, highC: cowbellHighC, highD: cowbellHighD, lowA: cowbellLowA, lowB: cowbellLowB, lowC: cowbellLowC, lowD: cowbellLowD, strongA: cowbellStrongA, strongB: cowbellStrongB, strongC: cowbellStrongC, strongD: cowbellStrongD },
    digital: { highA: digitalHighA, highB: digitalHighB, highC: digitalHighC, highD: digitalHighD, lowA: digitalLowA, lowB: digitalLowB, lowC: digitalLowC, lowD: digitalLowD, strongA: digitalStrongA, strongB: digitalStrongB, strongC: digitalStrongC, strongD: digitalStrongD },
    jamblock: { highA: jamblockHighA, highB: jamblockHighB, highC: jamblockHighC, highD: jamblockHighD, lowA: jamblockLowA, lowB: jamblockLowB, lowC: jamblockLowC, lowD: jamblockLowD, strongA: jamblockStrongA, strongB: jamblockStrongB, strongC: jamblockStrongC, strongD: jamblockStrongD },
    sine: { highA: sineHighA, highB: sineHighB, highC: sineHighC, highD: sineHighD, lowA: sineLowA, lowB: sineLowB, lowC: sineLowC, lowD: sineLowD, strongA: sineStrongA, strongB: sineStrongB, strongC: sineStrongC, strongD: sineStrongD },
    blip: { highA: blipHighA, highB: blipHighB, highC: blipHighC, highD: blipHighD, lowA: blipLowA, lowB: blipLowB, lowC: blipLowC, lowD: blipLowD, strongA: blipStrongA, strongB: blipStrongB, strongC: blipStrongC, strongD: blipStrongD },
    clave: { highA: claveHighA, highB: claveHighB, highC: claveHighC, highD: claveHighD, lowA: claveLowA, lowB: claveLowB, lowC: claveLowC, lowD: claveLowD, strongA: claveStrongA, strongB: claveStrongB, strongC: claveStrongC, strongD: claveStrongD },
    cajon: { highA: cajonHighA, highB: cajonHighB, highC: cajonHighC, highD: cajonHighD, lowA: cajonLowA, lowB: cajonLowB, lowC: cajonLowC, lowD: cajonLowD, strongA: cajonStrongA, strongB: cajonStrongB, strongC: cajonStrongC, strongD: cajonStrongD },
    marimba: { highA: marimbaHighA, highB: marimbaHighB, highC: marimbaHighC, highD: marimbaHighD, lowA: marimbaLowA, lowB: marimbaLowB, lowC: marimbaLowC, lowD: marimbaLowD, strongA: marimbaStrongA, strongB: marimbaStrongB, strongC: marimbaStrongC, strongD: marimbaStrongD },
    stick: { highA: stickHighA, highB: stickHighB, highC: stickHighC, highD: stickHighD, lowA: stickLowA, lowB: stickLowB, lowC: stickLowC, lowD: stickLowD, strongA: stickStrongA, strongB: stickStrongB, strongC: stickStrongC, strongD: stickStrongD },
  }), [
    classicHighA, classicHighB, classicHighC, classicHighD, classicLowA, classicLowB, classicLowC, classicLowD, classicStrongA, classicStrongB, classicStrongC, classicStrongD,
    woodblockHighA, woodblockHighB, woodblockHighC, woodblockHighD, woodblockLowA, woodblockLowB, woodblockLowC, woodblockLowD, woodblockStrongA, woodblockStrongB, woodblockStrongC, woodblockStrongD,
    cowbellHighA, cowbellHighB, cowbellHighC, cowbellHighD, cowbellLowA, cowbellLowB, cowbellLowC, cowbellLowD, cowbellStrongA, cowbellStrongB, cowbellStrongC, cowbellStrongD,
    digitalHighA, digitalHighB, digitalHighC, digitalHighD, digitalLowA, digitalLowB, digitalLowC, digitalLowD, digitalStrongA, digitalStrongB, digitalStrongC, digitalStrongD,
    jamblockHighA, jamblockHighB, jamblockHighC, jamblockHighD, jamblockLowA, jamblockLowB, jamblockLowC, jamblockLowD, jamblockStrongA, jamblockStrongB, jamblockStrongC, jamblockStrongD,
    sineHighA, sineHighB, sineHighC, sineHighD, sineLowA, sineLowB, sineLowC, sineLowD, sineStrongA, sineStrongB, sineStrongC, sineStrongD,
    blipHighA, blipHighB, blipHighC, blipHighD, blipLowA, blipLowB, blipLowC, blipLowD, blipStrongA, blipStrongB, blipStrongC, blipStrongD,
    claveHighA, claveHighB, claveHighC, claveHighD, claveLowA, claveLowB, claveLowC, claveLowD, claveStrongA, claveStrongB, claveStrongC, claveStrongD,
    cajonHighA, cajonHighB, cajonHighC, cajonHighD, cajonLowA, cajonLowB, cajonLowC, cajonLowD, cajonStrongA, cajonStrongB, cajonStrongC, cajonStrongD,
    marimbaHighA, marimbaHighB, marimbaHighC, marimbaHighD, marimbaLowA, marimbaLowB, marimbaLowC, marimbaLowD, marimbaStrongA, marimbaStrongB, marimbaStrongC, marimbaStrongD,
    stickHighA, stickHighB, stickHighC, stickHighD, stickLowA, stickLowB, stickLowC, stickLowD, stickStrongA, stickStrongB, stickStrongC, stickStrongD,
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
