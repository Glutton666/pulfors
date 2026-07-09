/**
 * 단일 활성 모달 상태 머신 — 순수 로직
 *
 * app/index.tsx 의 activeModal 상태 머신에서 순수 계산 부분을 분리한다.
 * React 의존성이 없어 Node.js 테스트 환경에서 그대로 임포트해 검증할 수 있다.
 *
 * 앱 코드(app/index.tsx)도 이 모듈을 직접 임포트하므로
 * 이 모듈을 검증하는 테스트는 실제 프로덕션 코드 경로를 커버한다.
 */

export type ActiveModal =
  | "settings"
  | "menu"
  | "signalGen"
  | "tuningGuide"
  | "practiceBook"
  | "workUp"
  | "onboarding"
  | "moreMenu"
  | "drumKit"
  | "scheduledStart"
  | "fadeOut"
  | "bpmDetect"
  | "stemSep"
  | null;

/** activeModal 단일 값에서 각 모달의 visible 여부를 파생한다. */
export function deriveModalFlags(activeModal: ActiveModal) {
  return {
    showSettings:       activeModal === "settings",
    showMenu:           activeModal === "menu",
    showSignalGen:      activeModal === "signalGen",
    showTuningGuide:    activeModal === "tuningGuide",
    showPracticeBook:   activeModal === "practiceBook",
    showWorkUp:         activeModal === "workUp",
    showOnboarding:     activeModal === "onboarding",
    showMoreMenu:       activeModal === "moreMenu",
    showDrumKit:        activeModal === "drumKit",
    showScheduledStart: activeModal === "scheduledStart",
    showFadeOut:        activeModal === "fadeOut",
    showBpmDetect:      activeModal === "bpmDetect",
    showStemSep:        activeModal === "stemSep",
  };
}

/** 현재 visible=true 인 모달 수를 반환한다. */
export function countVisibleModals(
  flags: ReturnType<typeof deriveModalFlags>,
): number {
  return Object.values(flags).filter(Boolean).length;
}

// ──────────────────────────────────────────────────────────────────
// SignalGenerator → TuningGuide 전환 관련 순수 로직
//
// app/index.tsx 의 onOpenTuningGuide / TuningGuideModal onClose /
// TuningGuideModal onSelectFreq 핸들러가 직접 호출한다.
// ──────────────────────────────────────────────────────────────────

/** SignalGenerator → TuningGuide 전환 상태 */
export interface SgTgState {
  activeModal: ActiveModal;
  /** TuningGuide 종료 후 SignalGenerator 를 자동 재오픈할지 여부 */
  reopenSignalGenAfterTuningGuide: boolean;
}

/**
 * SignalGenerator 내부에서 TuningGuide 버튼을 눌렀을 때의 상태 전환.
 * - activeModal: "tuningGuide" 로 교체 (SignalGen 은 visible=false)
 * - reopenSignalGenAfterTuningGuide: true (종료 시 자동 재오픈)
 */
export function openTuningGuideFromSignalGen(_state: SgTgState): SgTgState {
  return {
    activeModal: "tuningGuide",
    reopenSignalGenAfterTuningGuide: true,
  };
}

/**
 * TuningGuide 닫기 (onClose 또는 onSelectFreq 공통 종료 로직).
 * - SignalGen 경로로 진입했으면 SignalGen 을 재오픈한다.
 * - 그 외 경로면 아무 모달도 열지 않는다.
 */
export function closeTuningGuide(state: SgTgState): SgTgState {
  if (state.reopenSignalGenAfterTuningGuide) {
    return { activeModal: "signalGen", reopenSignalGenAfterTuningGuide: false };
  }
  return { activeModal: null, reopenSignalGenAfterTuningGuide: false };
}
