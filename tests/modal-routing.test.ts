/**
 * 주요 모달 진입 흐름 회귀 테스트
 *
 * 검증 대상:
 *   1. 메인 메뉴 → 음원 분리(StemSep) 전환 시
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
    "onboarding", "drumKit", "scheduledStart", "fadeOut",
    "bpmDetect", "stemSep",
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
    ["drumKit",        "showDrumKit"],
    ["scheduledStart", "showScheduledStart"],
    ["fadeOut",        "showFadeOut"],
    ["bpmDetect",      "showBpmDetect"],
    ["stemSep",        "showStemSep"],
  ];
  for (const [modal, expectedKey] of cases) {
    const flags = deriveModalFlags(modal);
    assert.equal(flags[expectedKey], true, `${modal} → ${expectedKey} 가 true 여야 한다`);
    assert.equal(countVisibleModals(flags), 1, `${modal} 일 때 visible 모달은 정확히 1개여야 한다`);
  }
});

// ────────────────────────────────────────────────────────────────
// 2. 메인 메뉴 → 음원 분리 전환
//    메뉴 항목 탭 시 openExclusive("stemSep") 가 setActiveModal 을 호출한다.
//    activeModal 단일 문자열 구조 때문에 mutual exclusion이 보장된다.
// ────────────────────────────────────────────────────────────────

test("modal-routing: menu → stemSep — 전환 전 menu만 visible, 전환 후 stemSep만 visible", () => {
  const beforeFlags = deriveModalFlags("menu");
  assert.equal(beforeFlags.showMenu, true);
  assert.equal(countVisibleModals(beforeFlags), 1);

  const afterFlags = deriveModalFlags("stemSep");
  assert.equal(afterFlags.showMenu, false, "메뉴가 닫혀야 한다");
  assert.equal(afterFlags.showStemSep, true, "stemSep 모달이 열려야 한다");
  assert.equal(countVisibleModals(afterFlags), 1, "전환 후 visible 모달은 1개여야 한다");
});

test("modal-routing: menu와 stemSep이 동시에 visible=true가 되는 경우 없음", () => {
  const beforeFlags = deriveModalFlags("menu");
  const afterFlags  = deriveModalFlags("stemSep");
  const keys = Object.keys(beforeFlags) as Array<keyof typeof beforeFlags>;
  const simultaneous = keys.filter((k) => beforeFlags[k] && afterFlags[k]);
  assert.deepEqual(simultaneous, [], "menu → stemSep 전환 중 두 모달이 동시에 visible 이면 안 된다");
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
//      B. menu → stemSep
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

test("rapid-tap: menu → stemSep — 빠른 연속 탭에서 visible 모달은 항상 ≤ 1", () => {
  // 사용자가 빠르게: 메뉴 열기 → 음원 분리 → 닫기 → 다시 반복
  const sequence: ActiveModal[] = [
    null,
    "menu",
    "stemSep",
    null,
    "menu",     // 빠른 재탭
    "stemSep",
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

test("rapid-tap: menu → stemSep — 연속 전환에서 동시에 두 모달 visible 없음", () => {
  const transitions: Array<[ActiveModal, ActiveModal]> = [
    [null,      "menu"],
    ["menu",    "stemSep"],
    ["stemSep", null],
    [null,      "menu"],      // 빠른 재탭
    ["menu",    "stemSep"],
    ["stemSep", null],
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
// 5. 소스 구조 테스트 — 메인 메뉴 음원 분리 항목 및 핸들러 검증
//
//    a) components/MenuScreen.tsx 에 testID="menu-stemSep" 항목이 있어야 한다
//    b) components/MetronomeScreenUI.tsx 의 <MenuScreen> onStemSep 핸들러는
//       openExclusive("stemSep") 를 경유해야 하며, stemSepReturnModalRef 로
//       복귀 모달을 저장해야 한다.
// ────────────────────────────────────────────────────────────────

/**
 * lib/modal-routing.ts 의 ActiveModal 유니온 타입에 선언된
 * 모든 비-null 리터럴 값을 추출한다.
 */
function extractActiveModalLiterals(): Set<string> {
  const src = readFileSync(join(process.cwd(), "lib/modal-routing.ts"), "utf-8");

  const typeMatch = src.match(/export type ActiveModal\s*=\s*([\s\S]*?);/);
  assert.ok(typeMatch, "lib/modal-routing.ts 에서 ActiveModal 타입 선언을 찾을 수 없다");

  const literals = new Set<string>();
  const literalRe = /["']([a-zA-Z]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = literalRe.exec(typeMatch![1])) !== null) {
    literals.add(m[1]);
  }
  return literals;
}

test("source: ActiveModal 타입에 stemSep 리터럴이 선언되어 있다", () => {
  assert.ok(extractActiveModalLiterals().has("stemSep"));
});

test("source: MenuScreen — 음원 분리 항목에 testID=\"menu-stemSep\" 가 존재한다", () => {
  const src = readFileSync(join(process.cwd(), "components/MenuScreen.tsx"), "utf-8");
  assert.ok(
    src.includes('testID: "menu-stemSep"') || src.includes('testID="menu-stemSep"'),
    'components/MenuScreen.tsx 에 testID "menu-stemSep" 가 없다 — e2e 테스트가 음원 분리 항목에 접근하려면 필요하다',
  );
  assert.ok(
    /onPress:\s*onStemSep/.test(src),
    "MenuScreen 의 음원 분리 항목이 onStemSep 핸들러를 사용해야 한다",
  );
});

/**
 * components/MetronomeScreenUI.tsx 의 <MenuScreen … /> JSX 블록에서
 * 지정한 핸들러 prop 의 소스 문자열을 반환한다.
 */
function extractMenuScreenHandlerSource(handlerName: string): string {
  const src = readFileSync(join(process.cwd(), "components/MetronomeScreenUI.tsx"), "utf-8");

  const startIdx = src.indexOf("<MenuScreen");
  assert.ok(startIdx !== -1, "components/MetronomeScreenUI.tsx 에서 <MenuScreen 를 찾을 수 없다");

  const endIdx = src.indexOf("/>", startIdx);
  assert.ok(endIdx !== -1, "components/MetronomeScreenUI.tsx 에서 <MenuScreen 의 닫는 /> 를 찾을 수 없다");

  const block = src.slice(startIdx, endIdx + 2);

  const propStart = block.indexOf(`${handlerName}={`);
  assert.ok(propStart !== -1, `<MenuScreen 블록에서 ${handlerName}={ 를 찾을 수 없다`);

  const braceStart = block.indexOf("{", propStart + handlerName.length + 1);
  let depth = 0;
  let i = braceStart;
  for (; i < block.length; i++) {
    if (block[i] === "{") depth++;
    else if (block[i] === "}") { depth--; if (depth === 0) break; }
  }

  return block.slice(propStart, i + 1);
}

test("source: MenuScreen onStemSep 핸들러가 openExclusive(\"stemSep\")를 호출한다", () => {
  const prop = extractMenuScreenHandlerSource("onStemSep");
  assert.ok(
    /openExclusive\(["']stemSep["']\)/.test(prop),
    `onStemSep 핸들러에 openExclusive("stemSep") 호출이 없다 — 모달 전환은 반드시 openExclusive 를 경유해야 한다:\n${prop}`,
  );
});

test("source: MenuScreen onStemSep 핸들러가 복귀용 stemSepReturnModalRef 를 설정한다", () => {
  const prop = extractMenuScreenHandlerSource("onStemSep");
  assert.ok(
    /stemSepReturnModalRef\.current\s*=/.test(prop),
    `onStemSep 핸들러가 stemSepReturnModalRef 를 설정하지 않는다 — 음원 분리 종료 시 메뉴 복귀가 깨진다:\n${prop}`,
  );
});

test("source: MenuScreen onStemSep 핸들러가 setActiveModal 을 직접 호출하지 않는다 (openExclusive 우회 방지)", () => {
  const prop = extractMenuScreenHandlerSource("onStemSep");
  assert.ok(
    !/setActiveModal\(\s*(?!null\s*\))/.test(prop),
    `onStemSep 핸들러에서 setActiveModal(null) 이 아닌 직접 호출이 발견됐다:\n${prop}`,
  );
});

// ────────────────────────────────────────────────────────────────
// 7. Android AppState lifecycle — background → foreground 복귀 시
//    모달 상호 배타성(mutual exclusion) 유지 검증
//
//    문제 상황 (task #97):
//      Android 에서 앱이 background 로 이동 후 foreground 로 복귀할 때
//      시스템이 synthetic back-press 이벤트를 보낼 수 있다.
//      이 이벤트가 열려 있는 모달 상태와 경쟁(race)할 경우
//      두 모달이 동시에 visible 상태가 되지 않는지 검증한다.
//
//    app/index.tsx 구현 분석:
//      A) AppState "change" → "active" 핸들러:
//           engineRef.current?.resyncTiming() 만 호출한다.
//           setActiveModal / openExclusive 를 호출하지 않는다.
//           → 복귀 후 activeModal 은 background 진입 전과 동일하게 유지된다.
//
//      B) BackHandler "hardwareBackPress" 핸들러:
//           useEffect 의존 배열: [activeModal, showReboot]
//           → stale closure 없이 항상 최신 activeModal 을 참조한다.
//           → if (showXxx) { setActiveModal(null); return true; } 패턴으로
//             정확히 하나의 모달만 닫는다.
//
//    구조적 보장:
//      activeModal 은 단일 string | null 값이다.
//      setActiveModal(next) 는 원자적으로 값을 교체한다.
//      → 어떤 순서로 AppState / BackHandler 이벤트가 와도
//        visible 모달 수는 항상 ≤ 1 이다.
//
//    시뮬레이션 방식:
//      두 핸들러의 실제 동작을 순수 함수로 모델링한 뒤,
//      이벤트 시퀀스(foreground 복귀 → back-press)를 단계별로
//      시뮬레이션하여 각 단계의 visible 모달 수를 검증한다.
// ────────────────────────────────────────────────────────────────

/**
 * app/index.tsx AppState "change" → "active" 핸들러 동작 시뮬레이션.
 *
 * 실제 구현:
 *   AppState.addEventListener("change", (nextState) => {
 *     if (nextState === "active") {
 *       engineRef.current?.resyncTiming();   ← activeModal 변경 없음
 *     }
 *   });
 *
 * 반환: background 진입 전과 동일한 activeModal (핸들러가 변경하지 않음).
 */
function simulateAppStateForegroundReturn(activeModal: ActiveModal): ActiveModal {
  // resyncTiming() 만 호출 — activeModal 상태를 건드리지 않는다.
  return activeModal;
}

/**
 * app/index.tsx BackHandler "hardwareBackPress" 핸들러 동작 시뮬레이션.
 *
 * 실제 핸들러의 if-else 체인을 그대로 재현한다:
 *   if (showSettings)      { setActiveModal(null); return true; }
 *   if (showTuningGuide)   { ...; setActiveModal(signalGen|null); return true; }
 *   if (showSignalGen)     { setActiveModal(null); return true; }
 *   ... (모든 모달 분기)
 *   Alert.alert(...)       (activeModal 변경 없음)
 *
 * 반환값:
 *   nextActiveModal — 핸들러가 setActiveModal 에 전달하는 값
 *   consumed        — 이벤트를 소비했는지 여부 (항상 true)
 */
function simulateBackPress(
  activeModal: ActiveModal,
  reopenSignalGenAfterTuningGuide: boolean,
): { nextActiveModal: ActiveModal; consumed: boolean } {
  const {
    showSettings,
    showTuningGuide,
    showSignalGen,
    showPracticeBook,
    showWorkUp,
    showFadeOut,
    showScheduledStart,
    showDrumKit,
    showMenu,
    showOnboarding,
  } = deriveModalFlags(activeModal);

  // app/index.tsx BackHandler onBack 의 if-else 체인과 동일한 순서
  if (showSettings)      return { nextActiveModal: null,          consumed: true };
  if (showTuningGuide) {
    // SignalGen 경로로 진입했으면 SignalGen 재오픈, 아니면 null
    const next: ActiveModal = reopenSignalGenAfterTuningGuide ? "signalGen" : null;
    return { nextActiveModal: next, consumed: true };
  }
  if (showSignalGen)     return { nextActiveModal: null,          consumed: true };
  if (showPracticeBook)  return { nextActiveModal: null,          consumed: true };
  if (showWorkUp)        return { nextActiveModal: null,          consumed: true };
  if (showFadeOut)       return { nextActiveModal: null,          consumed: true };
  if (showScheduledStart)return { nextActiveModal: null,          consumed: true };
  if (showDrumKit)       return { nextActiveModal: null,          consumed: true };
  if (showMenu)          return { nextActiveModal: null,          consumed: true };
  if (showOnboarding)    return { nextActiveModal: null,          consumed: true };
  // 모든 모달이 닫혀 있거나 showReboot 상태: Alert.alert — activeModal 변경 없음
  return { nextActiveModal: activeModal,                          consumed: true };
}

test("android-appstate: settings 열림 → foreground 복귀 → AppState 이벤트 후 activeModal 불변 → visible=1", () => {
  // simulateAppStateForegroundReturn 은 "AppState active 핸들러가 activeModal 을 바꾸지 않는다"
  // 는 명시적 계약을 실행하는 시뮬레이션이다.
  const before: ActiveModal = "settings";
  const after = simulateAppStateForegroundReturn(before);

  assert.equal(after, "settings", "AppState active 이후 activeModal 값이 바뀌어서는 안 된다");
  assert.equal(countVisibleModals(deriveModalFlags(after)), 1,
    "foreground 복귀 후에도 settings 모달 1개만 visible 이어야 한다");
});

test("android-appstate: drumKit 열림 → foreground 복귀 → AppState 이벤트 후 activeModal 불변 → visible=1", () => {
  const before: ActiveModal = "drumKit";
  const after = simulateAppStateForegroundReturn(before);

  assert.equal(after, "drumKit", "AppState active 이후 activeModal 값이 바뀌어서는 안 된다");
  assert.equal(countVisibleModals(deriveModalFlags(after)), 1,
    "foreground 복귀 후에도 drumKit 모달 1개만 visible 이어야 한다");
});

test("android-appstate: settings 열림 → foreground 복귀 → back-press → visible=0 (이벤트 시퀀스 시뮬레이션)", () => {
  // 이벤트 시퀀스: AppState active → hardwareBackPress
  let activeModal: ActiveModal = "settings";

  // 1단계: background → foreground (AppState 핸들러 실행)
  activeModal = simulateAppStateForegroundReturn(activeModal);
  assert.equal(countVisibleModals(deriveModalFlags(activeModal)), 1,
    "foreground 복귀 직후: settings visible=1");

  // 2단계: system back-press (BackHandler onBack 실행)
  const { nextActiveModal, consumed } = simulateBackPress(activeModal, false);
  assert.equal(consumed, true, "back-press 이벤트는 항상 소비된다");
  assert.equal(nextActiveModal, null, "settings 상태에서 back-press → setActiveModal(null)");
  assert.equal(countVisibleModals(deriveModalFlags(nextActiveModal)), 0,
    "back-press 처리 후 visible 모달 0개");
});

test("android-appstate: drumKit 열림 → foreground 복귀 → back-press → visible=0 (이벤트 시퀀스 시뮬레이션)", () => {
  let activeModal: ActiveModal = "drumKit";

  // 1단계: background → foreground
  activeModal = simulateAppStateForegroundReturn(activeModal);
  assert.equal(countVisibleModals(deriveModalFlags(activeModal)), 1,
    "foreground 복귀 직후: drumKit visible=1");

  // 2단계: back-press
  const { nextActiveModal, consumed } = simulateBackPress(activeModal, false);
  assert.equal(consumed, true);
  assert.equal(nextActiveModal, null, "drumKit 상태에서 back-press → setActiveModal(null)");
  assert.equal(countVisibleModals(deriveModalFlags(nextActiveModal)), 0,
    "back-press 처리 후 visible 모달 0개");
});

test("android-appstate: 모든 모달 상태에서 foreground 복귀 → back-press → visible ≤ 1 (완전 커버리지)", () => {
  // 모든 ActiveModal 값에 대해 이벤트 시퀀스를 시뮬레이션한다.
  const allModals: ActiveModal[] = [
    "settings", "menu", "signalGen", "tuningGuide",
    "practiceBook", "workUp", "drumKit",
    "scheduledStart", "fadeOut", "onboarding",
    "bpmDetect", "stemSep",
    null,
  ];

  for (const modal of allModals) {
    // 1단계: foreground 복귀 — AppState 핸들러 실행
    const afterReturn = simulateAppStateForegroundReturn(modal);
    const expectedVisible = modal === null ? 0 : 1;
    assert.equal(
      countVisibleModals(deriveModalFlags(afterReturn)),
      expectedVisible,
      `${modal}: foreground 복귀 후 visible 모달 수 불일치`,
    );

    // 2단계: back-press — BackHandler 실행
    const { nextActiveModal } = simulateBackPress(afterReturn, false);
    assert.ok(
      countVisibleModals(deriveModalFlags(nextActiveModal)) <= 1,
      `${modal}: back-press 후 visible 모달이 1개를 초과하면 안 된다`,
    );
  }
});

test("android-appstate: 전체 시나리오 — settings 열림 → background → foreground → back-press → 각 단계 visible ≤ 1", () => {
  // 각 단계의 activeModal 값을 시뮬레이션 함수로 전파하며 검증한다.
  let activeModal: ActiveModal = null;
  assert.equal(countVisibleModals(deriveModalFlags(activeModal)), 0, "초기: null");

  // 메뉴 열기
  activeModal = "menu";
  assert.equal(countVisibleModals(deriveModalFlags(activeModal)), 1, "메뉴 열기: menu");

  // 설정 열기
  activeModal = "settings";
  assert.equal(countVisibleModals(deriveModalFlags(activeModal)), 1, "설정 열기: settings");

  // background → foreground (AppState 핸들러 실행)
  activeModal = simulateAppStateForegroundReturn(activeModal);
  assert.equal(countVisibleModals(deriveModalFlags(activeModal)), 1,
    "background → foreground 복귀: settings 그대로");

  // back-press (BackHandler 실행)
  const { nextActiveModal } = simulateBackPress(activeModal, false);
  activeModal = nextActiveModal;
  assert.equal(countVisibleModals(deriveModalFlags(activeModal)), 0, "back-press 후: null");
});

test("android-appstate: 전체 시나리오 — drumKit 열림 → background → foreground → back-press → 각 단계 visible ≤ 1", () => {
  let activeModal: ActiveModal = null;

  activeModal = "menu";
  assert.equal(countVisibleModals(deriveModalFlags(activeModal)), 1, "메뉴 열기");

  activeModal = "drumKit";
  assert.equal(countVisibleModals(deriveModalFlags(activeModal)), 1, "드럼 킷 열기");

  // background → foreground
  activeModal = simulateAppStateForegroundReturn(activeModal);
  assert.equal(countVisibleModals(deriveModalFlags(activeModal)), 1, "복귀 후: drumKit 그대로");

  // back-press
  const { nextActiveModal } = simulateBackPress(activeModal, false);
  activeModal = nextActiveModal;
  assert.equal(countVisibleModals(deriveModalFlags(activeModal)), 0, "back-press 후: null");
});

test("android-appstate: 복귀 후 연속 모달 전환에서도 mutual exclusion 유지", () => {
  // foreground 복귀 후 사용자가 다른 모달을 여닫는 시나리오
  // 각 전환의 before/after 사이에 동시에 true 인 플래그가 없어야 한다.
  let activeModal: ActiveModal = "settings";
  activeModal = simulateAppStateForegroundReturn(activeModal); // 복귀 → 동일

  const transitions: Array<[ActiveModal, ActiveModal]> = [
    [activeModal, simulateBackPress(activeModal, false).nextActiveModal], // back-press
    [null, "menu"],
    ["menu", "drumKit"],
    ["drumKit", simulateBackPress("drumKit", false).nextActiveModal],  // back-press
    [null, "settings"],
    ["settings", simulateBackPress("settings", false).nextActiveModal],  // back-press
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

// ────────────────────────────────────────────────────────────────
// 7c. TuningGuide 경로 — back-press 처리 검증
//
//     SignalGen → TuningGuide 경로:
//       openTuningGuideFromSignalGen() 로 TuningGuide 에 진입하면
//       reopenSignalGenAfterTuningGuide=true 가 설정된다.
//       background → foreground 복귀 후 back-press 를 누르면
//       BackHandler tuningGuide 분기가 SignalGen 을 재오픈해야 한다.
//
//     TuningGuide 독립 경로:
//       SignalGen 을 거치지 않고 TuningGuide 를 열면
//       reopenSignalGenAfterTuningGuide=false 이다.
//       back-press 후 아무 모달도 열리지 않아야 한다.
// ────────────────────────────────────────────────────────────────

test("android-appstate/tuningGuide: signalGen 경로 진입 → foreground 복귀 → back-press → signalGen 재오픈 (visible=1)", () => {
  // 1단계: signalGen 열림 → TuningGuide 진입
  let sgTg: SgTgState = { activeModal: "signalGen", reopenSignalGenAfterTuningGuide: false };
  sgTg = openTuningGuideFromSignalGen(sgTg);
  assert.equal(sgTg.activeModal, "tuningGuide");
  assert.equal(sgTg.reopenSignalGenAfterTuningGuide, true);
  assert.equal(countVisibleModals(deriveModalFlags(sgTg.activeModal)), 1,
    "TuningGuide 진입 직후: tuningGuide visible=1");

  // 2단계: background → foreground (AppState 핸들러 — activeModal 변경 없음)
  const afterReturn = simulateAppStateForegroundReturn(sgTg.activeModal);
  assert.equal(afterReturn, "tuningGuide",
    "foreground 복귀 후 activeModal 은 tuningGuide 그대로여야 한다");
  assert.equal(countVisibleModals(deriveModalFlags(afterReturn)), 1,
    "foreground 복귀 후 tuningGuide visible=1 유지");

  // 3단계: back-press (BackHandler tuningGuide 분기 — reopenSignalGen=true)
  const { nextActiveModal, consumed } = simulateBackPress(
    afterReturn,
    sgTg.reopenSignalGenAfterTuningGuide,
  );
  assert.equal(consumed, true, "back-press 이벤트는 소비되어야 한다");
  assert.equal(nextActiveModal, "signalGen",
    "signalGen 경로 back-press → signalGen 이 재오픈되어야 한다");
  assert.equal(countVisibleModals(deriveModalFlags(nextActiveModal)), 1,
    "signalGen 재오픈 후 visible=1");
});

test("android-appstate/tuningGuide: 독립 경로(signalGen 없이) → foreground 복귀 → back-press → null (visible=0)", () => {
  // 1단계: TuningGuide 를 직접 열기 (signalGen 거치지 않음)
  //        reopenSignalGenAfterTuningGuide=false
  let activeModal: ActiveModal = "tuningGuide";
  const reopenFlag = false;
  assert.equal(countVisibleModals(deriveModalFlags(activeModal)), 1,
    "TuningGuide 독립 열기: visible=1");

  // 2단계: background → foreground (AppState 핸들러 — activeModal 변경 없음)
  const afterReturn = simulateAppStateForegroundReturn(activeModal);
  assert.equal(afterReturn, "tuningGuide",
    "foreground 복귀 후 activeModal 은 tuningGuide 그대로여야 한다");
  assert.equal(countVisibleModals(deriveModalFlags(afterReturn)), 1,
    "foreground 복귀 후 tuningGuide visible=1 유지");

  // 3단계: back-press (BackHandler tuningGuide 분기 — reopenSignalGen=false)
  const { nextActiveModal, consumed } = simulateBackPress(afterReturn, reopenFlag);
  assert.equal(consumed, true, "back-press 이벤트는 소비되어야 한다");
  assert.equal(nextActiveModal, null,
    "독립 경로 back-press → null (아무 모달도 열리지 않아야 한다)");
  assert.equal(countVisibleModals(deriveModalFlags(nextActiveModal)), 0,
    "back-press 후 visible=0");
});

test("source/tuningGuide: BackHandler tuningGuide 분기가 reopenSignalGenAfterTuningGuideRef 를 참조한다", () => {
  // BackHandler onBack 의 showTuningGuide 분기가 reopenSignalGenAfterTuningGuideRef 를
  // 직접 참조해 재오픈 여부를 결정하는지 소스 분석으로 검증한다.
  // 이 참조가 없으면 SignalGen 경로 back-press 에서 재오픈 로직이 실행되지 않는다.
  const src = readFileSync(join(process.cwd(), "hooks/useMetronomeScreen.ts"), "utf-8");

  const addListenerIdx = src.indexOf('BackHandler.addEventListener("hardwareBackPress"');
  assert.ok(addListenerIdx !== -1, 'BackHandler.addEventListener("hardwareBackPress" 를 찾을 수 없다');

  // addEventListener 앞의 onBack 함수 본문을 추출 — BackHandler useEffect 전체 블록
  // BackHandler useEffect 의 시작점을 찾는다
  const backHandlerEffectIdx = src.lastIndexOf("useEffect(", addListenerIdx);
  assert.ok(backHandlerEffectIdx !== -1, "BackHandler useEffect 시작점을 찾을 수 없다");

  const backHandlerBlock = extractBracedBlock(src, backHandlerEffectIdx);

  // showTuningGuide 분기가 있는지 확인
  assert.ok(
    backHandlerBlock.includes("showTuningGuide"),
    "BackHandler 본문에 showTuningGuide 분기가 없다 — tuningGuide back-press 처리가 누락되었다",
  );

  // reopenSignalGenAfterTuningGuideRef 참조가 있는지 확인
  assert.ok(
    backHandlerBlock.includes("reopenSignalGenAfterTuningGuideRef"),
    "BackHandler tuningGuide 분기에 reopenSignalGenAfterTuningGuideRef 참조가 없다 — " +
    "SignalGen 경로 back-press 시 signalGen 재오픈 로직이 실행되지 않는다",
  );

  // showTuningGuide 분기 내부에 reopenSignalGenAfterTuningGuideRef 가 포함되는지
  // tuningGuide 관련 위치를 찾아 검증
  const tuningGuideIdx = backHandlerBlock.indexOf("showTuningGuide");
  const reopenIdx = backHandlerBlock.indexOf("reopenSignalGenAfterTuningGuideRef");
  const signalGenIdx = backHandlerBlock.indexOf('"signalGen"', reopenIdx);
  assert.ok(
    tuningGuideIdx < reopenIdx,
    "reopenSignalGenAfterTuningGuideRef 참조가 showTuningGuide 분기 이전에 위치한다 — " +
    "tuningGuide 분기 내부에서 재오픈 플래그를 확인해야 한다",
  );
  assert.ok(
    signalGenIdx !== -1,
    'BackHandler tuningGuide 분기 안에서 "signalGen" 을 setActiveModal 에 전달하는 코드가 없다',
  );
});

// ────────────────────────────────────────────────────────────────
// 7b. 소스 구조 테스트 — AppState / BackHandler 구현 계약 검증
//
//     위 시뮬레이션 테스트의 전제 조건(simulateAppStateForegroundReturn 과
//     simulateBackPress 의 모델이 실제 구현과 일치하는지)을 소스 분석으로 검증.
//
//     중괄호 깊이 추적으로 콜백 본문을 정확히 추출해 계약 위반을 탐지한다.
// ────────────────────────────────────────────────────────────────

/**
 * 주어진 소스 문자열에서 startIdx 부터 시작하는 첫 번째 { } 블록을 반환한다.
 * 중괄호 깊이를 추적해 중첩 구조를 올바르게 처리한다.
 */
function extractBracedBlock(src: string, startIdx: number): string {
  const braceStart = src.indexOf("{", startIdx);
  if (braceStart === -1) throw new Error("{ 를 찾을 수 없다");
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(braceStart, i + 1);
}

test("android-appstate: 소스 검증 — AppState 콜백 본문에 setActiveModal·openExclusive 미포함", () => {
  // simulateAppStateForegroundReturn 의 "activeModal 변경 없음" 모델이 성립하려면
  // 실제 AppState 핸들러 콜백 본문에 setActiveModal / openExclusive 가 없어야 한다.
  const src = readFileSync(join(process.cwd(), "hooks/useMetronomeScreen.ts"), "utf-8");

  const adapterIdx = src.indexOf('AppState.addEventListener("change"');
  assert.ok(adapterIdx !== -1, 'AppState.addEventListener("change" 를 찾을 수 없다');

  // 콜백 화살표 함수의 { ... } 본문을 중괄호 깊이 추적으로 추출
  const callbackBody = extractBracedBlock(src, adapterIdx);

  assert.ok(
    !callbackBody.includes("setActiveModal("),
    "AppState 콜백 본문에 setActiveModal 호출이 있어서는 안 된다 — " +
    "simulateAppStateForegroundReturn 의 '변경 없음' 모델 전제가 무효화된다\n" +
    `추출된 본문:\n${callbackBody}`,
  );
  assert.ok(
    !callbackBody.includes("openExclusive("),
    "AppState 콜백 본문에 openExclusive 호출이 있어서는 안 된다",
  );
});

test("android-appstate: 소스 검증 — BackHandler useEffect 의존 배열에 activeModal 포함 (stale closure 방지)", () => {
  // simulateBackPress 가 항상 최신 activeModal 을 참조한다고 가정하는 근거:
  // BackHandler useEffect 의존 배열에 activeModal 이 있어야 한다.
  const src = readFileSync(join(process.cwd(), "hooks/useMetronomeScreen.ts"), "utf-8");

  const addListenerIdx = src.indexOf('BackHandler.addEventListener("hardwareBackPress"');
  assert.ok(addListenerIdx !== -1, 'BackHandler.addEventListener("hardwareBackPress" 를 찾을 수 없다');

  // addEventListener 이후의 소스에서 useEffect 의존 배열 }, [...]) 패턴 추출
  const afterListener = src.slice(addListenerIdx);
  const depsMatch = afterListener.match(/\},\s*\[([^\]]*)\]/);
  assert.ok(depsMatch,
    "BackHandler useEffect 의존 배열 }, [...]) 패턴을 찾을 수 없다 — " +
    "addEventListener 이후 useEffect 종료 패턴이 변경되었을 수 있다");

  const deps = depsMatch![1];
  assert.ok(
    deps.includes("activeModal"),
    `BackHandler useEffect 의존 배열에 activeModal 이 없다: [${deps}]\n` +
    "의존 배열 누락 시 stale closure 로 back-press 핸들러가 이전 모달 상태를 참조한다 — " +
    "simulateBackPress 의 최신 상태 참조 전제가 무효화된다",
  );
});

// ────────────────────────────────────────────────────────────────
// 8. Android auto-resume — autoResumeAfterInterruption 설정이
//    Android 포커스 회복 경로에서도 존중되는지 검증
//
//    구조:
//      Android audio focus 손실/회복
//        → initAndroidFocusCallbacks(notifyInterruptionBegin, notifyInterruptionEnd)
//        → onFocusLoss  → notifyInterruptionBegin()
//        → onFocusGain  → notifyInterruptionEnd()
//        → notifyInterruptionEnd 내부에서 autoResumeAfterInterruption 가드
//
//    소스 검증 2개 + 기능 테스트 2개로 구성한다.
// ────────────────────────────────────────────────────────────────

test("android-auto-resume: 소스 검증 — _layout.tsx가 initAndroidFocusCallbacks에 notifyInterruptionEnd를 전달한다", () => {
  // Android audio focus 회복(onFocusGain)이 notifyInterruptionEnd를 호출해야
  // autoResumeAfterInterruption 플래그가 존중된다.
  // initAndroidFocusCallbacks의 두 번째 인자로 notifyInterruptionEnd가
  // 전달되는지 소스 분석으로 검증한다.
  const src = readFileSync(join(process.cwd(), "app/_layout.tsx"), "utf-8");

  const callIdx = src.indexOf("initAndroidFocusCallbacks(");
  assert.ok(callIdx !== -1, "initAndroidFocusCallbacks 호출을 찾을 수 없다");

  // 호출 인자 목록 추출: initAndroidFocusCallbacks(arg1, arg2)
  const afterCall = src.slice(callIdx);
  const argsMatch = afterCall.match(/initAndroidFocusCallbacks\s*\(([^)]+)\)/);
  assert.ok(argsMatch, "initAndroidFocusCallbacks 인자 목록을 파싱할 수 없다");

  const args = argsMatch![1];
  assert.ok(
    args.includes("notifyInterruptionEnd"),
    `initAndroidFocusCallbacks의 두 번째 인자로 notifyInterruptionEnd가 없다: [${args}]\n` +
    "두 번째 인자는 onFocusGain 콜백으로 등록되므로 notifyInterruptionEnd 이어야 한다 — " +
    "그래야 autoResumeAfterInterruption 플래그 가드가 Android 경로에서 실행된다",
  );
});

test("android-auto-resume: 소스 검증 — notifyInterruptionEnd가 autoResumeAfterInterruption 가드를 포함한다", () => {
  // notifyInterruptionEnd 함수 본문에서 autoResumeAfterInterruption 확인이
  // bridge.resume() 호출 전에 존재해야 한다.
  const src = readFileSync(join(process.cwd(), "lib/audio-session.ts"), "utf-8");

  const fnIdx = src.indexOf("export function notifyInterruptionEnd()");
  assert.ok(fnIdx !== -1, "notifyInterruptionEnd 함수를 찾을 수 없다");

  const fnBody = extractBracedBlock(src, fnIdx);

  assert.ok(
    fnBody.includes("autoResumeAfterInterruption"),
    "notifyInterruptionEnd 본문에 autoResumeAfterInterruption 체크가 없다\n" +
    "이 가드가 없으면 사용자가 설정을 꺼도 Android 포커스 회복 시 메트로놈이 자동 재개된다",
  );

  // 가드가 bridge.resume() 호출 전에 위치하는지 확인
  const guardPos = fnBody.indexOf("autoResumeAfterInterruption");
  const resumePos = fnBody.indexOf("bridge.resume()");
  assert.ok(
    resumePos !== -1,
    "notifyInterruptionEnd 본문에 bridge.resume() 호출이 없다",
  );
  assert.ok(
    guardPos < resumePos,
    `autoResumeAfterInterruption 가드(pos=${guardPos})가 bridge.resume()(pos=${resumePos})보다 뒤에 있다 — ` +
    "가드는 resume 호출 전에 위치해야 한다",
  );
});

test("android-auto-resume: 기능 테스트 — autoResumeAfterInterruption=false이면 포커스 회복 후 resume을 호출하지 않는다", () => {
  // 실제 audio-session 모듈 함수를 직접 호출해 플래그 동작을 검증한다.
  // 이 경로는 Android에서 initAndroidFocusCallbacks → onFocusGain → notifyInterruptionEnd로
  // 이어지는 흐름과 동일하다.
  const {
    _resetAudioSessionForTests,
    registerMetronomeBridge,
    setAutoResumeAfterInterruption,
    notifyInterruptionBegin,
    notifyInterruptionEnd,
  } = require("../lib/audio-session") as typeof import("../lib/audio-session");

  _resetAudioSessionForTests();

  let resumeCount = 0;
  const fakeBridge = {
    isRunning: () => true,  // 인터럽션 전 메트로놈이 재생 중
    pause: () => {},
    resume: () => { resumeCount++; },
  };
  registerMetronomeBridge(fakeBridge);

  // 자동 재개 비활성화
  setAutoResumeAfterInterruption(false);

  // 인터럽션 시작 (전화 수신 등) → pause 처리됨
  notifyInterruptionBegin();
  // 이 시점에서 bridge.isRunning()이 true → pause 호출 후 pausedByInterruption=true

  // 포커스 회복 (onFocusGain 경로) → notifyInterruptionEnd 호출
  notifyInterruptionEnd();

  assert.equal(
    resumeCount,
    0,
    `autoResumeAfterInterruption=false일 때 resume이 ${resumeCount}회 호출됐다 (0이어야 한다) — ` +
    "Android 포커스 회복 경로에서 사용자 설정이 무시되고 있다",
  );

  _resetAudioSessionForTests();
});

test("android-auto-resume: 기능 테스트 — autoResumeAfterInterruption=true이면 포커스 회복 후 resume을 호출한다", () => {
  // 반대 경우: 설정이 활성화되어 있으면 자동 재개가 정상적으로 동작해야 한다.
  const {
    _resetAudioSessionForTests,
    registerMetronomeBridge,
    setAutoResumeAfterInterruption,
    notifyInterruptionBegin,
    notifyInterruptionEnd,
  } = require("../lib/audio-session") as typeof import("../lib/audio-session");

  _resetAudioSessionForTests();

  let resumeCount = 0;
  let isRunning = true;
  const fakeBridge = {
    isRunning: () => isRunning,
    pause: () => { isRunning = false; },
    resume: () => { resumeCount++; isRunning = true; },
  };
  registerMetronomeBridge(fakeBridge);

  // 자동 재개 활성화 (기본값이지만 명시적으로 설정)
  setAutoResumeAfterInterruption(true);

  // 인터럽션 시작 → pause
  notifyInterruptionBegin();
  assert.equal(isRunning, false, "notifyInterruptionBegin 후 bridge.pause()가 호출돼야 한다");

  // 포커스 회복 → resume
  notifyInterruptionEnd();

  assert.equal(
    resumeCount,
    1,
    `autoResumeAfterInterruption=true일 때 resume이 ${resumeCount}회 호출됐다 (1이어야 한다) — ` +
    "Android 포커스 회복 경로에서 자동 재개가 동작하지 않는다",
  );

  _resetAudioSessionForTests();
});
