/**
 * BeatIndicator 관련 공용 타입 — 중립 위치.
 * BeatIndicator/BlockPill/DialBeatDot 등 컴포넌트 간 순환 의존을 회피합니다.
 */
import type { SoundSet } from "@/lib/storage";
import type { BeatType } from "@/lib/metronome-engine";

export type { BeatType } from "@/lib/metronome-engine";

export type BlockPlayMode = "sequential" | "loop" | "random";

export interface BarRepeat {
  type: "count" | "duration";
  value: number;
  bpm?: number;
}

export interface LoopBlock {
  startBeat: number;
  endBeat: number;
  type: "count" | "duration";
  value: number;
  jumpToBlock?: number;
  jumpCount?: number;
  bpm?: number;
  soundSet?: SoundSet;
  layerOf?: number;
  ownBeatTypes?: Record<number, BeatType>;
  ownSubdivisions?: Record<string, BeatType[]>;
}
