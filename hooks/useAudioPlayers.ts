import { useEffect, useMemo, useRef } from "react";
import { useAudioPlayer } from "expo-audio";
import type { AudioPlayer as ExpoAudioPlayer } from "expo-audio";
import { soundSets } from "@/lib/metronome-engine";
import type { SoundSet } from "@/lib/storage";

export interface SoundSetPlayers {
  highA: ExpoAudioPlayer;
  highB: ExpoAudioPlayer;
  lowA: ExpoAudioPlayer;
  lowB: ExpoAudioPlayer;
  strongA: ExpoAudioPlayer;
  strongB: ExpoAudioPlayer;
}

export type BuiltinPlayers = Record<keyof typeof soundSets, SoundSetPlayers>;

export interface AudioPlayersHook {
  allPlayers: BuiltinPlayers;
  allPlayersRef: React.MutableRefObject<BuiltinPlayers>;
  soundSetRef: React.MutableRefObject<SoundSet>;
  highToggle: React.MutableRefObject<boolean>;
  lowToggle: React.MutableRefObject<boolean>;
  strongToggle: React.MutableRefObject<boolean>;
}

/**
 * Builtin sound-set audio player pool (5 sets × 3 roles × 2 instances = 30
 * players). Owns toggle/ref bookkeeping so app/index.tsx no longer carries
 * 50 lines of identical useAudioPlayer boilerplate.
 *
 * Hook order is unconditional and identical to the original inline calls,
 * so this is a behavior-preserving extraction.
 */
export function useAudioPlayers(soundSet: SoundSet): AudioPlayersHook {
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

  const cowbellHighA = useAudioPlayer(soundSets.cowbell.high);
  const cowbellHighB = useAudioPlayer(soundSets.cowbell.high);
  const cowbellLowA = useAudioPlayer(soundSets.cowbell.low);
  const cowbellLowB = useAudioPlayer(soundSets.cowbell.low);
  const cowbellStrongA = useAudioPlayer(soundSets.cowbell.strong);
  const cowbellStrongB = useAudioPlayer(soundSets.cowbell.strong);

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

  const triangleHighA = useAudioPlayer(soundSets.triangle.high);
  const triangleHighB = useAudioPlayer(soundSets.triangle.high);
  const triangleLowA = useAudioPlayer(soundSets.triangle.low);
  const triangleLowB = useAudioPlayer(soundSets.triangle.low);
  const triangleStrongA = useAudioPlayer(soundSets.triangle.strong);
  const triangleStrongB = useAudioPlayer(soundSets.triangle.strong);

  const hihatHighA = useAudioPlayer(soundSets.hihat.high);
  const hihatHighB = useAudioPlayer(soundSets.hihat.high);
  const hihatLowA = useAudioPlayer(soundSets.hihat.low);
  const hihatLowB = useAudioPlayer(soundSets.hihat.low);
  const hihatStrongA = useAudioPlayer(soundSets.hihat.strong);
  const hihatStrongB = useAudioPlayer(soundSets.hihat.strong);

  const allPlayers = useMemo<BuiltinPlayers>(() => ({
    classic: { highA: classicHighA, highB: classicHighB, lowA: classicLowA, lowB: classicLowB, strongA: classicStrongA, strongB: classicStrongB },
    woodblock: { highA: woodblockHighA, highB: woodblockHighB, lowA: woodblockLowA, lowB: woodblockLowB, strongA: woodblockStrongA, strongB: woodblockStrongB },
    cowbell: { highA: cowbellHighA, highB: cowbellHighB, lowA: cowbellLowA, lowB: cowbellLowB, strongA: cowbellStrongA, strongB: cowbellStrongB },
    digital: { highA: digitalHighA, highB: digitalHighB, lowA: digitalLowA, lowB: digitalLowB, strongA: digitalStrongA, strongB: digitalStrongB },
    rimshot: { highA: rimshotHighA, highB: rimshotHighB, lowA: rimshotLowA, lowB: rimshotLowB, strongA: rimshotStrongA, strongB: rimshotStrongB },
    triangle: { highA: triangleHighA, highB: triangleHighB, lowA: triangleLowA, lowB: triangleLowB, strongA: triangleStrongA, strongB: triangleStrongB },
    hihat: { highA: hihatHighA, highB: hihatHighB, lowA: hihatLowA, lowB: hihatLowB, strongA: hihatStrongA, strongB: hihatStrongB },
  }), [classicHighA, classicHighB, classicLowA, classicLowB, classicStrongA, classicStrongB, woodblockHighA, woodblockHighB, woodblockLowA, woodblockLowB, woodblockStrongA, woodblockStrongB, cowbellHighA, cowbellHighB, cowbellLowA, cowbellLowB, cowbellStrongA, cowbellStrongB, digitalHighA, digitalHighB, digitalLowA, digitalLowB, digitalStrongA, digitalStrongB, rimshotHighA, rimshotHighB, rimshotLowA, rimshotLowB, rimshotStrongA, rimshotStrongB, triangleHighA, triangleHighB, triangleLowA, triangleLowB, triangleStrongA, triangleStrongB, hihatHighA, hihatHighB, hihatLowA, hihatLowB, hihatStrongA, hihatStrongB]);

  const highToggle = useRef(false);
  const lowToggle = useRef(false);
  const strongToggle = useRef(false);
  const soundSetRef = useRef<SoundSet>(soundSet);
  useEffect(() => { soundSetRef.current = soundSet; }, [soundSet]);
  const allPlayersRef = useRef<BuiltinPlayers>(allPlayers);
  useEffect(() => { allPlayersRef.current = allPlayers; }, [allPlayers]);

  return { allPlayers, allPlayersRef, soundSetRef, highToggle, lowToggle, strongToggle };
}
