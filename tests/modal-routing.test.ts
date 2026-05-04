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
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

// ────────────────────────────────────────────────────────────────
// 4. 빠른 연속 탭(rapid double-tap) 스트레스 테스트
//
//    openExclusive 는 setActiveModal(next) 를 원자적으로 호출하므로
//    빠른 연속 탭도 activeModal 값의 순차 전환으로 모델링된다.
//    각 전환 단계에서 visible 모달이 정확히 0 또는 1개임을 검증한다.
//
//    커버 시나리오 (task #85 Done 기준):
//      A. menu → settings  (같은 메뉴를 빠르게 열고-닫고-다시 열기)
//      B. menu → moreMenu → drumKit
//      C. menu → signalGen → tuningGuide
// ────────────────────────────────────────────────────────────────

test("rapid-tap: menu → settings — 빠른 연속 탭에서 visible 모달은 항상 ≤ 1", () => {
  // 사용자가 메뉴 버튼을 빠르게 여러 번 누르는 시나리오:
  // null → menu → settings → null → menu → settings → null
  const sequence: ActiveModal[] = [
    null,
    "menu",
    "settings",
    null,
    "menu",
    "settings",
    null,
  ];

  for (const activeModal of sequence) {
    const flags = deriveModalFlags(activeModal);
    const count = countVisibleModals(flags);
    assert.ok(
      count <= 1,
      `activeModal="${activeModal}" 전환 중 visible 모달 수 ${count}개 — 최대 1개여야 한다`,
    );
  }
});

test("rapid-tap: menu → settings 빠른 토글 — 동일 모달이 open-close-open 반복해도 동시에 두 개 visible 안 됨", () => {
  // 같은 모달을 빠르게 열고 닫을 때: 연속된 두 상태에서 동시에 true 인 플래그가 없어야 한다
  const transitions: Array<[ActiveModal, ActiveModal]> = [
    [null,       "menu"],
    ["menu",     "settings"],
    ["settings", null],
    [null,       "menu"],      // 같은 메뉴를 다시 빠르게 탭
    ["menu",     "settings"],  // 같은 설정을 다시 빠르게 탭
    ["settings", null],
  ];

  for (const [from, to] of transitions) {
    const beforeFlags = deriveModalFlags(from);
    const afterFlags  = deriveModalFlags(to);
    const keys = Object.keys(beforeFlags) as Array<keyof typeof beforeFlags>;
    const simultaneous = keys.filter((k) => beforeFlags[k] && afterFlags[k]);
    assert.deepEqual(
      simultaneous,
      [],
      `${from} → ${to} 전환 중 두 모달이 동시에 visible 이면 안 된다`,
    );
  }
});

test("rapid-tap: menu → moreMenu → drumKit — 빠른 연속 탭에서 visible 모달은 항상 ≤ 1", () => {
  // 사용자가 빠르게: 메뉴 열기 → 더보기 메뉴 → 드럼 킷 → 닫기 → 다시 반복
  const sequence: ActiveModal[] = [
    null,
    "menu",
    "moreMenu",
    "drumKit",
    null,
    "menu",     // 빠른 재탭
    "moreMenu",
    "drumKit",
    null,
  ];

  for (const activeModal of sequence) {
    const flags = deriveModalFlags(activeModal);
    const count = countVisibleModals(flags);
    assert.ok(
      count <= 1,
      `activeModal="${activeModal}" 전환 중 visible 모달 수 ${count}개 — 최대 1개여야 한다`,
    );
  }
});

test("rapid-tap: menu → moreMenu → drumKit — 연속 전환에서 동시에 두 모달 visible 없음", () => {
  const transitions: Array<[ActiveModal, ActiveModal]> = [
    [null,       "menu"],
    ["menu",     "moreMenu"],
    ["moreMenu", "drumKit"],
    ["drumKit",  null],
    [null,       "menu"],      // 빠른 재탭
    ["menu",     "moreMenu"],
    ["moreMenu", "drumKit"],
    ["drumKit",  null],
  ];

  for (const [from, to] of transitions) {
    const beforeFlags = deriveModalFlags(from);
    const afterFlags  = deriveModalFlags(to);
    const keys = Object.keys(beforeFlags) as Array<keyof typeof beforeFlags>;
    const simultaneous = keys.filter((k) => beforeFlags[k] && afterFlags[k]);
    assert.deepEqual(
      simultaneous,
      [],
      `${from} → ${to} 전환 중 두 모달이 동시에 visible 이면 안 된다`,
    );
  }
});

test("rapid-tap: menu → signalGen → tuningGuide — 빠른 연속 탭에서 visible 모달은 항상 ≤ 1", () => {
  // 사용자가 빠르게: 메뉴 열기 → 신호 발생기 → 튜닝 가이드 → 닫기 → 다시 반복
  // signalGen → tuningGuide 전환은 openTuningGuideFromSignalGen 을 사용한다.
  let sgTg: SgTgState = { activeModal: null, reopenSignalGenAfterTuningGuide: false };

  // 1차 시퀀스
  const step1: ActiveModal[] = [null, "menu", "signalGen"];
  for (const modal of step1) {
    sgTg = { ...sgTg, activeModal: modal };
    assert.ok(
      countVisibleModals(deriveModalFlags(sgTg.activeModal)) <= 1,
      `1차: activeModal="${modal}" 일 때 visible 모달이 1개를 초과하면 안 된다`,
    );
  }

  // signalGen → tuningGuide (openTuningGuideFromSignalGen 경로)
  sgTg = openTuningGuideFromSignalGen(sgTg);
  assert.ok(
    countVisibleModals(deriveModalFlags(sgTg.activeModal)) <= 1,
    `signalGen → tuningGuide 전환 후 visible 모달이 1개를 초과하면 안 된다`,
  );

  // tuningGuide 닫기 → signalGen 재오픈
  sgTg = closeTuningGuide(sgTg);
  assert.equal(sgTg.activeModal, "signalGen");
  assert.ok(
    countVisibleModals(deriveModalFlags(sgTg.activeModal)) <= 1,
    `tuningGuide 닫기 후 signalGen 재오픈 시 visible 모달이 1개를 초과하면 안 된다`,
  );

  // 빠른 재탭: signalGen → tuningGuide 다시
  sgTg = openTuningGuideFromSignalGen(sgTg);
  assert.ok(
    countVisibleModals(deriveModalFlags(sgTg.activeModal)) <= 1,
    `빠른 재탭: 두 번째 signalGen → tuningGuide 전환 후 visible 모달이 1개를 초과하면 안 된다`,
  );

  // 최종 닫기
  sgTg = closeTuningGuide(sgTg);
  sgTg = { activeModal: null, reopenSignalGenAfterTuningGuide: false };
  assert.equal(countVisibleModals(deriveModalFlags(null)), 0);
});

test("rapid-tap: menu → signalGen → tuningGuide — 연속 전환에서 동시에 두 모달 visible 없음", () => {
  // signalGen → tuningGuide 전환을 포함한 연속 탭 시나리오
  const plainTransitions: Array<[ActiveModal, ActiveModal]> = [
    [null,      "menu"],
    ["menu",    "signalGen"],
  ];
  for (const [from, to] of plainTransitions) {
    const beforeFlags = deriveModalFlags(from);
    const afterFlags  = deriveModalFlags(to);
    const keys = Object.keys(beforeFlags) as Array<keyof typeof beforeFlags>;
    const simultaneous = keys.filter((k) => beforeFlags[k] && afterFlags[k]);
    assert.deepEqual(
      simultaneous,
      [],
      `${from} → ${to} 전환 중 두 모달이 동시에 visible 이면 안 된다`,
    );
  }

  // signalGen → tuningGuide (openTuningGuideFromSignalGen 경로)
  const sgStart: SgTgState = { activeModal: "signalGen", reopenSignalGenAfterTuningGuide: false };
  const afterOpen = openTuningGuideFromSignalGen(sgStart);
  {
    const bf = deriveModalFlags(sgStart.activeModal);
    const af = deriveModalFlags(afterOpen.activeModal);
    const keys = Object.keys(bf) as Array<keyof typeof bf>;
    const simultaneous = keys.filter((k) => bf[k] && af[k]);
    assert.deepEqual(
      simultaneous,
      [],
      "signalGen → tuningGuide 전환 중 두 모달이 동시에 visible 이면 안 된다",
    );
  }

  // tuningGuide → signalGen (closeTuningGuide 경로)
  const afterClose = closeTuningGuide(afterOpen);
  {
    const bf = deriveModalFlags(afterOpen.activeModal);
    const af = deriveModalFlags(afterClose.activeModal);
    const keys = Object.keys(bf) as Array<keyof typeof bf>;
    const simultaneous = keys.filter((k) => bf[k] && af[k]);
    assert.deepEqual(
      simultaneous,
      [],
      "tuningGuide → signalGen 재오픈 전환 중 두 모달이 동시에 visible 이면 안 된다",
    );
  }
});

// ────────────────────────────────────────────────────────────────
// 5. 소스 구조 테스트 — MoreMenuModal testID 및 props 동기화 검증
//
//    정답(canonical) 소스: app/index.tsx 의 <MoreMenuModal … /> JSX 블록
//    해당 블록의 openExclusive("key") 호출이 "어떤 항목이 있어야 하는가"를 결정한다.
//
//    새 모달 항목 추가 시 다음이 모두 갖춰지지 않으면 자동으로 실패한다:
//      a) components/MoreMenuModal.tsx 의 각 항목 Pressable 에 testID 가 있어야 한다
//      b) MoreMenuModalProps 의 onXxx 핸들러 목록이 app/index.tsx 의 openExclusive 키 목록과 일치해야 한다
// ────────────────────────────────────────────────────────────────

/**
 * lib/modal-routing.ts 의 ActiveModal 유니온 타입에 선언된
 * 모든 비-null 리터럴 값을 추출한다.
 */
function extractActiveModalLiterals(): Set<string> {
  const src = readFileSync(join(process.cwd(), "lib/modal-routing.ts"), "utf-8");

  // "foo" | "bar" | null; 형태의 유니온에서 문자열 리터럴만 추출
  const typeMatch = src.match(/export type ActiveModal\s*=\s*([\s\S]*?);/);
  assert.ok(typeMatch, "lib/modal-routing.ts 에서 ActiveModal 타입 선언을 찾을 수 없다");

  const literals = new Set<string>();
  const literalRe = /["']([a-zA-Z]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = literalRe.exec(typeMatch[1])) !== null) {
    literals.add(m[1]);
  }
  return literals;
}

/**
 * app/index.tsx 의 <MoreMenuModal … /> JSX 블록에서
 * openExclusive("key") 호출 키를 추출한다.
 * 이것이 "moreMenu 하위 모달 목록"의 유일한 정답(canonical) 소스다.
 *
 * 각 키가 ActiveModal 타입에 선언된 유효한 리터럴인지도 검증한다.
 */
function extractMoreMenuOpenExclusiveKeys(): string[] {
  const src = readFileSync(join(process.cwd(), "app/index.tsx"), "utf-8");

  // <MoreMenuModal 시작 위치 탐색
  const startIdx = src.indexOf("<MoreMenuModal");
  assert.ok(startIdx !== -1, "app/index.tsx 에서 <MoreMenuModal 를 찾을 수 없다");

  // 닫는 /> 탐색 — MoreMenuModal prop 콜백 내부에는 JSX가 없으므로
  // 첫 번째 /> 가 MoreMenuModal 의 닫는 태그다
  const endIdx = src.indexOf("/>", startIdx);
  assert.ok(endIdx !== -1, "app/index.tsx 에서 <MoreMenuModal 의 닫는 /> 를 찾을 수 없다");

  const block = src.slice(startIdx, endIdx + 2);

  // openExclusive("key") 패턴에서 key 추출
  const re = /openExclusive\(["']([a-zA-Z]+)["']\)/g;
  const keys: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    keys.push(m[1]);
  }

  assert.ok(
    keys.length > 0,
    "app/index.tsx <MoreMenuModal 블록에서 openExclusive 호출을 찾을 수 없다 — MoreMenuModal 의 항목 핸들러는 openExclusive(\"key\") 형태로 작성되어야 한다",
  );

  // 각 키가 ActiveModal 타입에 선언된 유효한 리터럴인지 검증
  const validLiterals = extractActiveModalLiterals();
  for (const key of keys) {
    assert.ok(
      validLiterals.has(key),
      `openExclusive("${key}") 의 키 "${key}" 가 lib/modal-routing.ts 의 ActiveModal 타입에 선언되어 있지 않다 — ActiveModal 타입에 먼저 추가해야 한다`,
    );
  }

  return keys;
}

test("source: MoreMenuModal — 각 항목 Pressable에 testID 속성이 존재한다", () => {
  // 정답 소스: app/index.tsx <MoreMenuModal> 블록의 openExclusive 호출 키
  const canonicalKeys = extractMoreMenuOpenExclusiveKeys();

  const modalSrc = readFileSync(join(process.cwd(), "components/MoreMenuModal.tsx"), "utf-8");

  // <Pressable 태그 기준으로 소스를 분할해 각 블록을 독립 검사
  const pressableBlocks = modalSrc.split("<Pressable");

  for (const key of canonicalKeys) {
    // 키 → 핸들러 이름 변환: "scheduledStart" → "onScheduledStart"
    const handler = "on" + key.charAt(0).toUpperCase() + key.slice(1);

    const block = pressableBlocks.find((b) => b.includes(`onPress={${handler}}`));

    assert.ok(
      block !== undefined,
      `onPress={${handler}} 가 있는 <Pressable 블록을 찾을 수 없다 (modal key: "${key}") — MoreMenuModal 에 항목을 추가할 때 <Pressable onPress={${handler}} …> 형태로 작성해야 한다`,
    );

    assert.ok(
      block!.includes("testID="),
      `onPress={${handler}} 가 있는 <Pressable 에 testID 속성이 없다 (modal key: "${key}") — 새 항목 추가 시 testID="more-menu-${key}" 형태로 포함해야 한다`,
    );
  }
});

// ────────────────────────────────────────────────────────────────
// 6. 소스 구조 테스트 — DrumKit·TempoQuiz 핸들러 내부 구조 검증
//
//    onDrumKit / onTempoQuiz 핸들러는 엔진 정지·상태 초기화 코드를 포함해
//    단순 람다가 아니다. 그럼에도 openExclusive("drumKit") /
//    openExclusive("tempoQuiz") 를 반드시 경유해야 하며,
//    setActiveModal 을 직접 호출해 openExclusive 를 우회해선 안 된다.
// ────────────────────────────────────────────────────────────────

/**
 * app/index.tsx 에서 <MoreMenuModal … /> JSX 블록을 추출하고,
 * 지정한 핸들러 prop (e.g. "onDrumKit") 의 화살표 함수 본문을 반환한다.
 *
 * 핸들러는 다음 형태로 작성되어 있다고 가정한다:
 *   onDrumKit={() => {
 *     ...
 *   }}
 */
function extractMoreMenuHandlerBody(handlerName: string): string {
  const src = readFileSync(join(process.cwd(), "app/index.tsx"), "utf-8");

  const startIdx = src.indexOf("<MoreMenuModal");
  assert.ok(startIdx !== -1, "app/index.tsx 에서 <MoreMenuModal 를 찾을 수 없다");

  const endIdx = src.indexOf("/>", startIdx);
  assert.ok(endIdx !== -1, "app/index.tsx 에서 <MoreMenuModal 의 닫는 /> 를 찾을 수 없다");

  const block = src.slice(startIdx, endIdx + 2);

  // handlerName={() => { … }} 형태에서 중괄호 내부를 추출
  const propIdx = block.indexOf(`${handlerName}={() => {`);
  assert.ok(
    propIdx !== -1,
    `<MoreMenuModal 블록에서 ${handlerName}={() => { 를 찾을 수 없다`,
  );

  // 중괄호 깊이 추적으로 핸들러 본문 종료 위치를 찾는다
  const bodyStart = block.indexOf("{", propIdx + handlerName.length + "={() => ".length);
  let depth = 0;
  let i = bodyStart;
  for (; i < block.length; i++) {
    if (block[i] === "{") depth++;
    else if (block[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }

  return block.slice(bodyStart, i + 1);
}

test("source: onDrumKit 핸들러가 openExclusive(\"drumKit\")를 호출한다", () => {
  const body = extractMoreMenuHandlerBody("onDrumKit");
  assert.ok(
    /openExclusive\(["']drumKit["']\)/.test(body),
    `onDrumKit 핸들러 본문에 openExclusive("drumKit") 호출이 없다 — ` +
    `핸들러 내부에서 모달 전환은 반드시 openExclusive 를 경유해야 한다:\n${body}`,
  );
});

test("source: onTempoQuiz 핸들러가 openExclusive(\"tempoQuiz\")를 호출한다", () => {
  const body = extractMoreMenuHandlerBody("onTempoQuiz");
  assert.ok(
    /openExclusive\(["']tempoQuiz["']\)/.test(body),
    `onTempoQuiz 핸들러 본문에 openExclusive("tempoQuiz") 호출이 없다 — ` +
    `핸들러 내부에서 모달 전환은 반드시 openExclusive 를 경유해야 한다:\n${body}`,
  );
});

test("source: onDrumKit 핸들러가 setActiveModal을 직접 호출하지 않는다 (openExclusive 우회 방지)", () => {
  const body = extractMoreMenuHandlerBody("onDrumKit");
  assert.ok(
    !body.includes("setActiveModal("),
    `onDrumKit 핸들러 본문에서 setActiveModal 직접 호출이 발견됐다 — ` +
    `openExclusive 를 우회하면 mutual exclusion 보장이 깨진다:\n${body}`,
  );
});

test("source: onTempoQuiz 핸들러가 setActiveModal을 직접 호출하지 않는다 (openExclusive 우회 방지)", () => {
  const body = extractMoreMenuHandlerBody("onTempoQuiz");
  assert.ok(
    !body.includes("setActiveModal("),
    `onTempoQuiz 핸들러 본문에서 setActiveModal 직접 호출이 발견됐다 — ` +
    `openExclusive 를 우회하면 mutual exclusion 보장이 깨진다:\n${body}`,
  );
});

test("source: MoreMenuModal onXxx 핸들러 목록과 app/index.tsx openExclusive 키 목록이 동기화되어 있다", () => {
  // 정답 소스: app/index.tsx <MoreMenuModal> 블록의 openExclusive 호출 키
  const canonicalKeys = [...extractMoreMenuOpenExclusiveKeys()].sort();

  const modalSrc = readFileSync(join(process.cwd(), "components/MoreMenuModal.tsx"), "utf-8");

  // MoreMenuModalProps 인터페이스 본문 추출
  const interfaceMatch = modalSrc.match(/export interface MoreMenuModalProps \{([\s\S]*?)\}/);
  assert.ok(
    interfaceMatch,
    "MoreMenuModalProps 인터페이스를 찾을 수 없다 — components/MoreMenuModal.tsx 에 export interface MoreMenuModalProps { … } 가 있어야 한다",
  );

  // onXxx: () => void 형태의 핸들러 prop 이름 추출 (onClose 제외)
  const handlerRe = /\bon([A-Z][a-zA-Z]+)\s*:\s*\(\)\s*=>/g;
  const handlerKeys: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = handlerRe.exec(interfaceMatch[1])) !== null) {
    const pascal = m[1]; // e.g. "ScheduledStart"
    if (pascal === "Close") continue; // onClose 는 항목 핸들러가 아님
    handlerKeys.push(pascal.charAt(0).toLowerCase() + pascal.slice(1));
  }
  handlerKeys.sort();

  assert.deepEqual(
    handlerKeys,
    canonicalKeys,
    `MoreMenuModal 인터페이스 onXxx 파생 키(${handlerKeys.join(", ")})와 app/index.tsx openExclusive 키(${canonicalKeys.join(", ")})가 일치하지 않는다\n` +
    "새 항목 추가 시: MoreMenuModalProps 인터페이스, Pressable(testID 포함), app/index.tsx <MoreMenuModal 블록을 함께 업데이트하세요.",
  );
});
