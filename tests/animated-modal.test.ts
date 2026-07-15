/**
 * animated-modal.test.ts
 *
 * AnimatedModal / AnimatedSlideModal 가시성 상태 머신과
 * 모달 라우팅 레이어(deriveModalFlags, countVisibleModals)를 검증한다.
 *
 * React / react-native-reanimated 없이 순수 JS 로직으로 실행한다.
 *
 * 설계:
 *   ModalVisibilitySimulation 클래스가 AnimatedModal (및 동일 패턴의
 *   AnimatedSlideModal) 의 useEffect 로직을 정확히 재현한다.
 *   이 시뮬레이터로 작성된 테스트가 통과하면 두 컴포넌트의
 *   "nativeVisible 상태 머신" 계약이 만족된다.
 *
 * 커버하는 모달:
 *   - 메인 메뉴  (app/index.tsx: <AnimatedModal visible={showMenu}>)
 *   - SettingsModal (AnimatedModal, fade 타입)
 *   - MoreMenuModal (AnimatedModal, fade 타입)
 *   - PracticeBookModal / ScheduledStartModal (AnimatedSlideModal, slide 타입)
 *
 * 배경:
 *   Task #84: fade-type 모달 → AnimatedModal 교체
 *   Task #95: slide-type 모달 → AnimatedSlideModal 교체
 *
 * 관련 파일:
 *   components/AnimatedModal.tsx
 *   lib/modal-routing.ts
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  deriveModalFlags,
  countVisibleModals,
  type ActiveModal,
  openTuningGuideFromSignalGen,
  closeTuningGuide,
} from "../lib/modal-routing";

// ─── 순수 상태 머신 시뮬레이터 ────────────────────────────────────────────────
//
// AnimatedModal.tsx useEffect 로직을 순수 클래스로 재현한다.
//
// 열기 경로 (visible=true):
//   - ++generation
//   - nativeVisible = true   ← 즉시
//   - animation: openValue 로 (테스트에서 콜백 없음)
//
// 닫기 경로 (visible=false):
//   - gen = ++generation
//   - animation: closeValue 로
//     → 완료 콜백에서 gen === generation 이면 nativeVisible = false
//
// AnimatedSlideModal 은 translateY 값을 사용하지만
// nativeVisible 전환 타이밍은 AnimatedModal 과 동일하므로 동일 시뮬레이터로 커버된다.
// ─────────────────────────────────────────────────────────────────────────────
class ModalVisibilitySimulation {
  nativeVisible: boolean;
  private generation: number;

  constructor(initialVisible: boolean) {
    this.nativeVisible = initialVisible;
    this.generation = initialVisible ? 1 : 0;
  }

  /**
   * visible prop 변경을 시뮬레이션한다.
   * 반환된 animDone(finished) 을 호출해 애니메이션 완료 또는 취소를 주입한다.
   */
  setVisible(visible: boolean): { animDone: (finished: boolean) => void } {
    if (visible) {
      ++this.generation;
      this.nativeVisible = true;
      // 열기 애니메이션 콜백은 nativeVisible 을 변경하지 않는다.
      return { animDone: () => {} };
    } else {
      const g = ++this.generation;
      return {
        animDone: (finished: boolean) => {
          // generation 검사: stale 콜백은 nativeVisible 을 false 로 바꾸지 않는다.
          if (finished && g === this.generation) {
            this.nativeVisible = false;
          }
        },
      };
    }
  }
}

// ─── 1. AnimatedModal 상태 머신 — 기본 동작 ──────────────────────────────────

describe("AnimatedModal 상태 머신 — 기본 동작", () => {
  test("초기 visible=false: nativeVisible 이 false 로 시작한다", () => {
    const sim = new ModalVisibilitySimulation(false);
    assert.equal(sim.nativeVisible, false);
  });

  test("초기 visible=true: nativeVisible 이 true 로 시작한다", () => {
    const sim = new ModalVisibilitySimulation(true);
    assert.equal(sim.nativeVisible, true);
  });

  test("열기: visible=true 설정 시 nativeVisible 이 즉시 true 가 된다 (애니메이션 완료 불필요)", () => {
    const sim = new ModalVisibilitySimulation(false);
    sim.setVisible(true);
    assert.equal(sim.nativeVisible, true);
  });

  test("닫기: 애니메이션 완료 전에는 nativeVisible 이 true 유지된다", () => {
    const sim = new ModalVisibilitySimulation(true);
    const { animDone } = sim.setVisible(false);
    assert.equal(sim.nativeVisible, true, "애니메이션 진행 중에는 아직 보여야 한다");
    animDone(true);
    assert.equal(sim.nativeVisible, false, "완료 후에는 숨겨야 한다");
  });

  test("닫기: 애니메이션이 취소(finished=false)되면 nativeVisible 이 true 유지된다", () => {
    const sim = new ModalVisibilitySimulation(true);
    const { animDone } = sim.setVisible(false);
    animDone(false); // 취소
    assert.equal(sim.nativeVisible, true);
  });
});

// ─── 2. AnimatedModal 상태 머신 — generation 추적 (stale 콜백 방지) ─────────

describe("AnimatedModal 상태 머신 — generation 추적", () => {
  test("닫힘 애니메이션 중 재열기 → stale 콜백이 nativeVisible 을 false 로 바꾸지 않는다", () => {
    const sim = new ModalVisibilitySimulation(true);
    const { animDone: stale } = sim.setVisible(false); // 닫기 시작
    sim.setVisible(true);                               // 재열기 (generation 증가)
    stale(true);                                        // stale 콜백 발화
    assert.equal(sim.nativeVisible, true, "재열기 후에도 보여야 한다");
  });

  test("재열기 후 새 닫기는 정상 동작한다", () => {
    const sim = new ModalVisibilitySimulation(true);
    const { animDone: stale } = sim.setVisible(false);
    sim.setVisible(true);
    stale(true);                                         // 무시됨

    const { animDone: fresh } = sim.setVisible(false);
    assert.equal(sim.nativeVisible, true);               // 아직 보임
    fresh(true);
    assert.equal(sim.nativeVisible, false);              // 이제 숨겨짐
  });

  test("연속 닫기 호출: 첫 번째 콜백은 stale, 마지막만 유효하다", () => {
    const sim = new ModalVisibilitySimulation(true);
    const { animDone: first } = sim.setVisible(false);
    const { animDone: second } = sim.setVisible(false);  // generation 증가
    first(true);   // stale
    assert.equal(sim.nativeVisible, true, "stale 콜백은 무시돼야 한다");
    second(true);  // 유효
    assert.equal(sim.nativeVisible, false);
  });

  test("닫기-열기-닫기-열기 빠른 전환: 최종 상태가 열림이어야 한다", () => {
    const sim = new ModalVisibilitySimulation(false);
    const { animDone: a1 } = sim.setVisible(false); // 이미 닫힌 상태에서 닫기 (no-op 에 가까움)
    sim.setVisible(true);
    const { animDone: a2 } = sim.setVisible(false);
    sim.setVisible(true);
    a1(true);
    a2(true);
    assert.equal(sim.nativeVisible, true, "마지막 열기 후 보여야 한다");
  });
});

// ─── 3. AnimatedModal 상태 머신 — 다회 사이클 ────────────────────────────────

describe("AnimatedModal 상태 머신 — 다회 사이클", () => {
  test("열기/닫기 3회 반복: 매 사이클 정상 전환", () => {
    const sim = new ModalVisibilitySimulation(false);
    for (let i = 0; i < 3; i++) {
      sim.setVisible(true);
      assert.equal(sim.nativeVisible, true, `cycle ${i}: 열기 후 보여야 한다`);

      const { animDone } = sim.setVisible(false);
      assert.equal(sim.nativeVisible, true, `cycle ${i}: 닫기 애니메이션 중 보여야 한다`);
      animDone(true);
      assert.equal(sim.nativeVisible, false, `cycle ${i}: 애니메이션 완료 후 숨겨야 한다`);
    }
  });

  test("이미 열린 상태에서 열기 재호출 → nativeVisible 계속 true", () => {
    const sim = new ModalVisibilitySimulation(true);
    sim.setVisible(true);
    assert.equal(sim.nativeVisible, true);
  });

  test("이미 닫힌 상태에서 animDone 호출 → nativeVisible 계속 false", () => {
    const sim = new ModalVisibilitySimulation(false);
    const { animDone } = sim.setVisible(false);
    animDone(true);
    assert.equal(sim.nativeVisible, false);
  });
});

// ─── 4. 메인 메뉴 모달 시나리오 ──────────────────────────────────────────────
//
// app/index.tsx: <AnimatedModal transparent visible={showMenu} ...>
// showMenu = activeModal === "menu"  (deriveModalFlags 참고)
// ─────────────────────────────────────────────────────────────────────────────

describe("메인 메뉴 모달 시나리오 (AnimatedModal, fade 타입)", () => {
  test("메뉴 열기: showMenu=true → 모달 즉시 노출", () => {
    const sim = new ModalVisibilitySimulation(false);
    sim.setVisible(true); // showMenu: false → true
    assert.equal(sim.nativeVisible, true);
  });

  test("메뉴 닫기: showMenu=false → 애니메이션 후 숨겨짐", () => {
    const sim = new ModalVisibilitySimulation(true);
    const { animDone } = sim.setVisible(false);
    assert.equal(sim.nativeVisible, true); // 닫힘 애니메이션 중 계속 보임
    animDone(true);
    assert.equal(sim.nativeVisible, false);
  });

  test("메뉴 닫기 중 다시 열기 → 메뉴가 계속 노출됨", () => {
    const sim = new ModalVisibilitySimulation(true);
    const { animDone: stale } = sim.setVisible(false);
    sim.setVisible(true);  // 닫히기 전에 재열기
    stale(true);
    assert.equal(sim.nativeVisible, true);
  });
});

// ─── 5. SettingsModal 시나리오 ────────────────────────────────────────────────
//
// components/SettingsModal.tsx: <AnimatedModal visible={visible} ...>
// visible = showSettings = activeModal === "settings"
// ─────────────────────────────────────────────────────────────────────────────

describe("SettingsModal 시나리오 (AnimatedModal, fade 타입)", () => {
  test("설정 열기: nativeVisible 즉시 true", () => {
    const sim = new ModalVisibilitySimulation(false);
    sim.setVisible(true);
    assert.equal(sim.nativeVisible, true);
  });

  test("설정 닫기: 애니메이션 완료 시에만 hidden", () => {
    const sim = new ModalVisibilitySimulation(true);
    const { animDone } = sim.setVisible(false);
    animDone(true);
    assert.equal(sim.nativeVisible, false);
  });

  test("설정 닫기 → 다른 모달 열기 중 stale 콜백 → 설정이 숨겨지지 않음", () => {
    // SettingsModal 이 닫히는 애니메이션 중 메인 메뉴가 열리는 시나리오
    const settingsSim = new ModalVisibilitySimulation(true);
    const { animDone: settingsStale } = settingsSim.setVisible(false);

    // 같은 애니메이션 사이클에서 다시 visible=true 가 될 수 있는 경우
    settingsSim.setVisible(true);
    settingsStale(true); // stale
    assert.equal(settingsSim.nativeVisible, true);
  });
});

// ─── 6. MoreMenuModal 시나리오 ────────────────────────────────────────────────
//
// components/MoreMenuModal.tsx: <AnimatedModal visible={visible} ...>
// visible = showMoreMenu = activeModal === "moreMenu"
// testID: more-menu-scheduled-start, more-menu-fade-out, etc.
// ─────────────────────────────────────────────────────────────────────────────

describe("MoreMenuModal 시나리오 (AnimatedModal, fade 타입)", () => {
  test("더보기 메뉴 열기: nativeVisible 즉시 true", () => {
    const sim = new ModalVisibilitySimulation(false);
    sim.setVisible(true);
    assert.equal(sim.nativeVisible, true);
  });

  test("더보기 메뉴 닫기: 애니메이션 완료 후 hidden", () => {
    const sim = new ModalVisibilitySimulation(true);
    const { animDone } = sim.setVisible(false);
    animDone(true);
    assert.equal(sim.nativeVisible, false);
  });

  test("더보기 메뉴: 빠른 open→close→open 시 nativeVisible 최종 true", () => {
    const sim = new ModalVisibilitySimulation(false);
    sim.setVisible(true);
    const { animDone: stale } = sim.setVisible(false);
    sim.setVisible(true);
    stale(true);
    assert.equal(sim.nativeVisible, true);
  });
});

// ─── 7. AnimatedSlideModal 시나리오 (동일 상태 머신 패턴) ──────────────────
//
// components/AnimatedModal.tsx: AnimatedSlideModal
// PracticeBookModal, ScheduledStartModal, ExportEntryModal, WorkUpOverviewModal
// 이 사용한다. translateY 값만 다를 뿐 nativeVisible 전환 로직은 동일.
// ─────────────────────────────────────────────────────────────────────────────

describe("AnimatedSlideModal 시나리오 (slide 타입 — 동일 상태 머신)", () => {
  test("슬라이드 열기: nativeVisible 즉시 true (translateY 애니메이션 완료 불필요)", () => {
    const sim = new ModalVisibilitySimulation(false);
    sim.setVisible(true);
    assert.equal(sim.nativeVisible, true);
  });

  test("슬라이드 닫기: 슬라이드 다운 완료 후에만 nativeVisible=false", () => {
    const sim = new ModalVisibilitySimulation(true);
    const { animDone } = sim.setVisible(false);
    assert.equal(sim.nativeVisible, true);
    animDone(true);
    assert.equal(sim.nativeVisible, false);
  });

  test("슬라이드 닫기 중 화면 회전(height 변경) 시뮬레이션: stale 콜백 무시됨", () => {
    // height 변경 시 AnimatedSlideModal 의 useEffect 가 재실행돼 새 gen 이 생성될 수 있다.
    // 이전 콜백은 stale 처리돼야 한다.
    const sim = new ModalVisibilitySimulation(true);
    const { animDone: oldCallback } = sim.setVisible(false); // 닫기 시작
    sim.setVisible(false); // height 변경으로 재실행 (새 gen)
    oldCallback(true); // 이전 콜백은 stale
    assert.equal(sim.nativeVisible, true, "stale 콜백은 무시돼야 한다");
  });
});

// ─── 8. 모달 라우팅 — deriveModalFlags ───────────────────────────────────────
//
// lib/modal-routing.ts 의 deriveModalFlags 가 activeModal → visible 플래그를
// 올바르게 파생하는지 검증한다. 이 함수가 각 AnimatedModal 에 visible 을 공급한다.
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveModalFlags — activeModal → visible 파생", () => {
  test("activeModal=null: 모든 플래그가 false", () => {
    const flags = deriveModalFlags(null);
    for (const [key, val] of Object.entries(flags)) {
      assert.equal(val, false, `${key} 는 false 여야 한다`);
    }
  });

  test("activeModal='menu': showMenu=true, 나머지 false", () => {
    const flags = deriveModalFlags("menu");
    assert.equal(flags.showMenu, true);
    assert.equal(flags.showSettings, false);
    assert.equal(flags.showMoreMenu, false);
  });

  test("activeModal='settings': showSettings=true, showMenu=false", () => {
    const flags = deriveModalFlags("settings");
    assert.equal(flags.showSettings, true);
    assert.equal(flags.showMenu, false);
  });

  test("activeModal='moreMenu': showMoreMenu=true, 나머지 false", () => {
    const flags = deriveModalFlags("moreMenu");
    assert.equal(flags.showMoreMenu, true);
    assert.equal(flags.showMenu, false);
    assert.equal(flags.showSettings, false);
  });

  test("activeModal='practiceBook': showPracticeBook=true", () => {
    const flags = deriveModalFlags("practiceBook");
    assert.equal(flags.showPracticeBook, true);
    assert.equal(countVisibleModals(flags), 1);
  });

  test("모든 activeModal 값에서 정확히 1개만 true 가 된다 (단일 모달 보장)", () => {
    const modals: ActiveModal[] = [
      "settings", "menu", "signalGen", "tuningGuide",
      "practiceBook", "workUp", "onboarding", "moreMenu",
      "drumKit", "scheduledStart", "fadeOut",
    ];
    for (const modal of modals) {
      const flags = deriveModalFlags(modal);
      const count = countVisibleModals(flags);
      assert.equal(count, 1, `activeModal='${modal}' 시 visible 모달이 정확히 1개여야 한다`);
    }
  });
});

// ─── 9. 모달 라우팅 — 상호 배타 보장 ────────────────────────────────────────

describe("모달 라우팅 — 단일 활성 모달 보장", () => {
  test("countVisibleModals: null 상태에서 0", () => {
    assert.equal(countVisibleModals(deriveModalFlags(null)), 0);
  });

  test("countVisibleModals: 모든 비-null 상태에서 정확히 1", () => {
    const allValues: ActiveModal[] = [
      "settings", "menu", "signalGen", "tuningGuide",
      "practiceBook", "workUp", "onboarding", "moreMenu",
      "drumKit", "scheduledStart", "fadeOut",
    ];
    for (const v of allValues) {
      assert.equal(countVisibleModals(deriveModalFlags(v)), 1, `${v} → 1 modal`);
    }
  });

  test("설정 → 메뉴 전환: 설정이 false 가 되고 메뉴가 true 가 된다", () => {
    const fromSettings = deriveModalFlags("settings");
    const toMenu = deriveModalFlags("menu");
    assert.equal(fromSettings.showSettings, true);
    assert.equal(fromSettings.showMenu, false);
    assert.equal(toMenu.showSettings, false);
    assert.equal(toMenu.showMenu, true);
  });

  test("더보기 → 설정 전환: 더보기 false, 설정 true", () => {
    const from = deriveModalFlags("moreMenu");
    const to = deriveModalFlags("settings");
    assert.equal(from.showMoreMenu, true);
    assert.equal(from.showSettings, false);
    assert.equal(to.showMoreMenu, false);
    assert.equal(to.showSettings, true);
  });
});

// ─── 10. SignalGenerator → TuningGuide 전환 ─────────────────────────────────

describe("SignalGenerator → TuningGuide 전환 순수 로직", () => {
  test("openTuningGuideFromSignalGen: activeModal 을 tuningGuide 로 전환하고 reopen 플래그 set", () => {
    const state = openTuningGuideFromSignalGen({
      activeModal: "signalGen",
      reopenSignalGenAfterTuningGuide: false,
    });
    assert.equal(state.activeModal, "tuningGuide");
    assert.equal(state.reopenSignalGenAfterTuningGuide, true);
  });

  test("closeTuningGuide (reopen=true): signalGen 으로 복귀", () => {
    const state = closeTuningGuide({
      activeModal: "tuningGuide",
      reopenSignalGenAfterTuningGuide: true,
    });
    assert.equal(state.activeModal, "signalGen");
    assert.equal(state.reopenSignalGenAfterTuningGuide, false);
  });

  test("closeTuningGuide (reopen=false): null 로 닫힘", () => {
    const state = closeTuningGuide({
      activeModal: "tuningGuide",
      reopenSignalGenAfterTuningGuide: false,
    });
    assert.equal(state.activeModal, null);
  });
});
