/**
 * 주요 모달 진입 흐름 회귀 테스트
 *
 * 검증 대상:
 *   1. MoreMenu → 하위 모달(ScheduledStart/FadeOut/DrumKit/TempoQuiz) 전환 시
 *      한 시점에 하나의 모달만 visible해지는지
 *   2. SignalGenerator → TuningGuide 전환 시 두 모달이 동시에 visible=true가
 *      되지 않으며, TuningGuide 종료 후 SignalGenerator가 재오픈되는지
 *
 * 모든 테스트는 lib/modal-routing.ts 의 실제 프로덕션 함수를 직접 임포트해
 * 검증한다. app/index.tsx 의 onOpenTuningGuide, TuningGuideModal onClose,
 * onSelectFreq 핸들러가 이 모듈의 동일한 함수를 호출하므로, 여기서 통과하는
 * 테스트는 실제 앱 런타임 경로를 커버한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type ActiveModal,
  deriveModalFlags,
  countVisibleModals,
  openTuningGuideFromSignalGen,
  closeTuningGuide,
  type SgTgState,
} from "../lib/modal-routing";

// ────────────────────────────────────────────────────────────────
// 1. deriveModalFlags — 단일 activeModal → 파생 플래그 정확성
//    (app/index.tsx 에서 직접 호출되는 함수)
// ────────────────────────────────────────────────────────────────

test("modal-routing: activeModal=null 이면 visible 모달이 0개", () => {
  assert.equal(countVisibleModals(deriveModalFlags(null)), 0);
});

test("modal-routing: 어떤 activeModal 값이든 visible 모달은 최대 1개", () => {
  const allValues: ActiveModal[] = [
    "settings", "menu", "signalGen", "tuningGuide", "practiceBook", "workUp",
    "onboarding", "moreMenu", "drumKit", "scheduledStart", "fadeOut", "tempoQuiz",
    null,
  ];
  for (const modal of allValues) {
    const count = countVisibleModals(deriveModalFlags(modal));
    assert.ok(
      count <= 1,
      `activeModal="${modal}" 일 때 visible 모달 수가 ${count}개 — 최대 1개여야 한다`,
    );
  }
});

test("modal-routing: 각 activeModal 값은 정확히 해당 show* 플래그만 true로 만든다", () => {
  const cases: Array<[ActiveModal, keyof ReturnType<typeof deriveModalFlags>]> = [
    ["settings",       "showSettings"],
    ["menu",           "showMenu"],
    ["signalGen",      "showSignalGen"],
    ["tuningGuide",    "showTuningGuide"],
    ["practiceBook",   "showPracticeBook"],
    ["workUp",         "showWorkUp"],
    ["onboarding",     "showOnboarding"],
    ["moreMenu",       "showMoreMenu"],
    ["drumKit",        "showDrumKit"],
    ["scheduledStart", "showScheduledStart"],
    ["fadeOut",        "showFadeOut"],
    ["tempoQuiz",      "showTempoQuiz"],
  ];
  for (const [modal, expectedKey] of cases) {
    const flags = deriveModalFlags(modal);
    assert.equal(flags[expectedKey], true, `${modal} → ${expectedKey} 가 true 여야 한다`);
    assert.equal(countVisibleModals(flags), 1, `${modal} 일 때 visible 모달은 정확히 1개여야 한다`);
  }
});

// ────────────────────────────────────────────────────────────────
// 2. MoreMenu → 하위 모달 전환
//    openExclusive(React callback)는 setActiveModal(next)를 호출한다.
//    activeModal 단일 문자열 구조 때문에 mutual exclusion이 보장된다.
//    아래 테스트는 그 구조적 보장을 파생 플래그 레벨에서 검증한다.
// ────────────────────────────────────────────────────────────────

const MORE_MENU_ITEMS: Array<[ActiveModal, keyof ReturnType<typeof deriveModalFlags>]> = [
  ["scheduledStart", "showScheduledStart"],
  ["fadeOut",        "showFadeOut"],
  ["drumKit",        "showDrumKit"],
  ["tempoQuiz",      "showTempoQuiz"],
];

for (const [item, flagKey] of MORE_MENU_ITEMS) {
  test(`modal-routing: MoreMenu → ${item} — 전환 전 MoreMenu만 visible, 전환 후 ${item}만 visible`, () => {
    // 전환 전: MoreMenu 만 열림
    const beforeFlags = deriveModalFlags("moreMenu");
    assert.equal(beforeFlags.showMoreMenu, true);
    assert.equal(countVisibleModals(beforeFlags), 1);

    // app/index.tsx 의 openExclusive 는 setActiveModal(next) 를 호출한다.
    // 다음 activeModal 값으로 파생 플래그를 계산해 전환 결과를 검증한다.
    const afterFlags = deriveModalFlags(item);
    assert.equal(afterFlags.showMoreMenu, false, "MoreMenu가 닫혀야 한다");
    assert.equal(afterFlags[flagKey], true,       `${item} 모달이 열려야 한다`);
    assert.equal(countVisibleModals(afterFlags), 1, "전환 후 visible 모달은 1개여야 한다");
  });
}

test("modal-routing: MoreMenu와 하위 모달이 동시에 visible=true가 되는 경우 없음", () => {
  // activeModal 이 단일 문자열이므로 before/after 에서 같은 key 가 동시에 true 일 수 없다.
  for (const [item] of MORE_MENU_ITEMS) {
    const beforeFlags = deriveModalFlags("moreMenu");
    const afterFlags  = deriveModalFlags(item);
    const keys = Object.keys(beforeFlags) as Array<keyof typeof beforeFlags>;
    const simultaneous = keys.filter((k) => beforeFlags[k] && afterFlags[k]);
    assert.deepEqual(
      simultaneous,
      [],
      `${item} 전환 중 두 모달이 동시에 visible 이면 안 된다`,
    );
  }
});

// ────────────────────────────────────────────────────────────────
// 3. SignalGenerator → TuningGuide 전환 및 재오픈
//    openTuningGuideFromSignalGen / closeTuningGuide 는 app/index.tsx 의
//    onOpenTuningGuide / TuningGuideModal onClose / onSelectFreq 핸들러가
//    직접 호출한다.
// ────────────────────────────────────────────────────────────────

test("modal-routing: openTuningGuideFromSignalGen — TuningGuide가 열리고 SignalGen이 닫힌다", () => {
  const before: SgTgState = { activeModal: "signalGen", reopenSignalGenAfterTuningGuide: false };
  const after = openTuningGuideFromSignalGen(before);

  const flags = deriveModalFlags(after.activeModal);
  assert.equal(flags.showTuningGuide, true,  "TuningGuide가 열려야 한다");
  assert.equal(flags.showSignalGen,   false,  "SignalGen은 visible=false 여야 한다");
  assert.equal(countVisibleModals(flags), 1, "TuningGuide 하나만 visible 이어야 한다");
});

test("modal-routing: openTuningGuideFromSignalGen — reopenSignalGen 플래그가 true로 설정된다", () => {
  const before: SgTgState = { activeModal: "signalGen", reopenSignalGenAfterTuningGuide: false };
  const after = openTuningGuideFromSignalGen(before);

  assert.equal(after.reopenSignalGenAfterTuningGuide, true);
  assert.equal(after.activeModal, "tuningGuide");
});

test("modal-routing: SignalGen → TuningGuide 전환 중 두 모달이 동시에 visible인 경우 없음", () => {
  const before: SgTgState = { activeModal: "signalGen", reopenSignalGenAfterTuningGuide: false };
  const after = openTuningGuideFromSignalGen(before);

  const beforeFlags = deriveModalFlags(before.activeModal);
  const afterFlags  = deriveModalFlags(after.activeModal);
  const keys = Object.keys(beforeFlags) as Array<keyof typeof beforeFlags>;
  const simultaneous = keys.filter((k) => beforeFlags[k] && afterFlags[k]);
  assert.deepEqual(simultaneous, [], "SignalGen → TuningGuide 전환 중 동시에 두 모달이 visible 이면 안 된다");
});

test("modal-routing: closeTuningGuide — SignalGen 경로이면 SignalGen 을 재오픈한다", () => {
  const tgState: SgTgState = { activeModal: "tuningGuide", reopenSignalGenAfterTuningGuide: true };
  const after = closeTuningGuide(tgState);

  assert.equal(after.activeModal, "signalGen", "SignalGen 이 재오픈되어야 한다");
  assert.equal(after.reopenSignalGenAfterTuningGuide, false, "재오픈 플래그는 클리어되어야 한다");
  assert.equal(countVisibleModals(deriveModalFlags(after.activeModal)), 1);
});

test("modal-routing: closeTuningGuide — 독립 경로이면 아무 모달도 열리지 않는다", () => {
  const tgState: SgTgState = { activeModal: "tuningGuide", reopenSignalGenAfterTuningGuide: false };
  const after = closeTuningGuide(tgState);

  assert.equal(after.activeModal, null);
  assert.equal(after.reopenSignalGenAfterTuningGuide, false);
  assert.equal(countVisibleModals(deriveModalFlags(null)), 0);
});

test("modal-routing: SignalGen → TG → 닫기 전체 흐름 — 각 단계에서 visible 모달 수 ≤ 1", () => {
  // 1) SignalGen 열림
  let sgTg: SgTgState = { activeModal: "signalGen", reopenSignalGenAfterTuningGuide: false };
  assert.equal(countVisibleModals(deriveModalFlags(sgTg.activeModal)), 1);

  // 2) TuningGuide 열기 (onOpenTuningGuide 에서 호출)
  sgTg = openTuningGuideFromSignalGen(sgTg);
  assert.equal(countVisibleModals(deriveModalFlags(sgTg.activeModal)), 1);

  // 3) TuningGuide 닫기 (onClose 에서 호출) → SignalGen 재오픈
  sgTg = closeTuningGuide(sgTg);
  assert.equal(sgTg.activeModal, "signalGen");
  assert.equal(countVisibleModals(deriveModalFlags(sgTg.activeModal)), 1);

  // 4) SignalGen 닫기
  sgTg = { activeModal: null, reopenSignalGenAfterTuningGuide: false };
  assert.equal(countVisibleModals(deriveModalFlags(null)), 0);
});
