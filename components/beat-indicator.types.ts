/**
 * BeatIndicator 관련 공용 타입 — 중립 위치.
 * BeatIndicator/BlockPill/DialBeatDot 등 컴포넌트 간 순환 의존을 회피합니다.
 */
import type { SoundSet } from "@/lib/storage";
import type { BeatType } from "@/lib/metronome-engine";

export type { BeatType } from "@/lib/metronome-engine";

export type BlockPlayMode = "sequential" | "loop" | "random";

/** 바 단위 레이어 — 메인 패턴과 독립된 서브디비전/사운드셋을 가집니다. */
export interface BarLayer {
  beatType: BeatType;
  subdivisions?: BeatType[];
  soundSet?: SoundSet;
}

export interface BarRepeat {
  type: "count" | "duration";
  value: number;
  bpm?: number;
  /** N회 부호: 최대 N번까지만 재생, 소진 후 건너뜀 */
  voltaMax?: number;
  /** 끝 부호: 모든 N회 조건 소진 시 정지 지점 */
  isEnd?: boolean;
  /** →N 점프 출발지 쌍 ID */
  jumpFromId?: number;
  /** ←N 점프 목적지 쌍 ID */
  jumpToId?: number;
  /** 바 단위 레이어 목록 */
  layers?: BarLayer[];
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
