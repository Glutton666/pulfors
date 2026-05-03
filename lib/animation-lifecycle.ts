export interface PendulumAnim {
  swingDuration: number;
  maxAngle: number;
}

export function computePendulumAnim(bpm: number): PendulumAnim {
  const safeBpm = Math.max(1, bpm);
  const swingDuration = 60000 / safeBpm;
  const maxAngle = Math.max(15, Math.min(35, 40 - safeBpm / 15));
  return { swingDuration, maxAngle };
}

export interface GlowParams {
  attackMs: number;
  releaseMs: number;
}

const GLOW_ATTACK_MS = 60;
const GLOW_RELEASE_MS = 500;
const GLOW_HIGH_BPM_THRESHOLD = 180;
const GLOW_HIGH_BPM_RELEASE_MS = 220;

export function computeGlowParams(bpm: number): GlowParams {
  if (bpm >= GLOW_HIGH_BPM_THRESHOLD) {
    const beatInterval = 60000 / Math.max(1, bpm);
    const release = Math.min(GLOW_HIGH_BPM_RELEASE_MS, Math.max(120, beatInterval * 0.85));
    return { attackMs: GLOW_ATTACK_MS, releaseMs: release };
  }
  return { attackMs: GLOW_ATTACK_MS, releaseMs: GLOW_RELEASE_MS };
}

// 펜듈럼/글로우 애니메이션 수명주기를 컴포넌트 밖에서도 테스트할 수 있도록
// "다음에 어떤 애니메이션 명령을 실행할지"를 순수 함수로 분리한다. reanimated
// 워클릿을 직접 호출하는 컴포넌트는 이 plan을 받아 그대로 매핑만 한다.
//
// 핵심 불변식:
//   1) deps가 바뀌면 항상 cancel이 먼저 실행돼야 한다 (이전 사이클 잔존 방지).
//   2) 정지 상태로 들어오면 home(0)으로 돌려보낸다.
//   3) 재생 중이면 한 변(swingDuration)만큼 timing 후 반복 시퀀스로 진입.

export type PendulumOp =
  | { type: "cancel" }
  | { type: "returnHome"; duration: number }
  | { type: "swing"; targetAngle: number; duration: number; maxAngle: number };

export const PENDULUM_RETURN_HOME_MS = 200;

export function pendulumPlan(args: {
  isPlaying: boolean;
  maxAngle: number;
  swingDuration: number;
}): PendulumOp[] {
  const ops: PendulumOp[] = [{ type: "cancel" }];
  if (!args.isPlaying) {
    ops.push({ type: "returnHome", duration: PENDULUM_RETURN_HOME_MS });
    return ops;
  }
  ops.push({
    type: "swing",
    targetAngle: args.maxAngle,
    duration: args.swingDuration,
    maxAngle: args.maxAngle,
  });
  return ops;
}

export type GlowOp =
  | { type: "cancel" }
  | { type: "pulse"; attackMs: number; releaseMs: number }
  | { type: "reset"; duration: number };

export const GLOW_RESET_MS = 200;

export function glowPlan(args: {
  isPlaying: boolean;
  currentBeat: number;
  prevBeat: number;
  bpm: number;
}): GlowOp[] {
  if (!args.isPlaying) {
    return [{ type: "cancel" }, { type: "reset", duration: GLOW_RESET_MS }];
  }
  if (args.currentBeat < 0 || args.currentBeat === args.prevBeat) return [];
  const { attackMs, releaseMs } = computeGlowParams(args.bpm);
  return [{ type: "cancel" }, { type: "pulse", attackMs, releaseMs }];
}
