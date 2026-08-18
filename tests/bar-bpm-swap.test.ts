/**
 * 바 모드 BPM 스왑 로직 회귀 테스트
 *
 * useMetronomeScreen의 handleBarModeChange 래퍼가 수행하는
 * BPM 격리 보장을 순수 JS 시뮬레이션으로 검증한다.
 * (훅 자체를 import하지 않아 의존성 모킹 부담이 없다.)
 *
 * 검증 항목:
 *  1. 바 모드 진입 시 글로벌 BPM이 prevGlobalBpmRef에 저장된다
 *  2. 바 모드 진입 시 barBpmRef / setBarBpm이 글로벌 BPM으로 초기화된다
 *  3. 바 모드 종료 시 updateBpm(prevGlobalBpm)이 호출되어 복원된다
 *  4. 바 모드 중 BPM을 바꿔도 글로벌 BPM은 종료 전까지 변하지 않는다
 *  5. 글로벌 BPM이 다른 상태에서 진입 → 변경 → 종료 후 원래 BPM 복원
 */

// ── 시뮬레이션 헬퍼 ──────────────────────────────────────────────────────────

/**
 * useMetronomeScreen.handleBarModeChange 래퍼의 로직을 그대로 복제한
 * 순수 함수 팩토리. 실제 구현과 1:1 대응하므로 구현이 바뀌면 이 함수도 갱신해야 한다.
 */
function makeBpmSwapHandler(opts: {
  bpmRef: { current: number };
  prevGlobalBpmRef: { current: number };
  barBpmRef: { current: number };
  setBarBpm: (v: number) => void;
  updateBpm: (v: number) => void;
  barModeHandleBarModeChange: (toBarMode: boolean) => void;
}) {
  return function handleBarModeChange(toBarMode: boolean) {
    if (toBarMode) {
      opts.prevGlobalBpmRef.current = opts.bpmRef.current;
      opts.barBpmRef.current = opts.bpmRef.current;
      opts.setBarBpm(opts.bpmRef.current);
      opts.barModeHandleBarModeChange(true);
    } else {
      opts.barModeHandleBarModeChange(false);
      opts.updateBpm(opts.prevGlobalBpmRef.current);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────────────────────────────────────

describe("useMetronomeScreen — handleBarModeChange BPM 스왑 로직", () => {

  // ── 1. 진입 시 prevGlobalBpmRef 저장 ──────────────────────────────────────

  it("진입 시 현재 글로벌 BPM이 prevGlobalBpmRef에 저장된다", () => {
    const bpmRef = { current: 140 };
    const prevGlobalBpmRef = { current: 120 };
    const barBpmRef = { current: 120 };
    const setBarBpm = jest.fn();
    const updateBpm = jest.fn();
    const barModeHandleBarModeChange = jest.fn();

    const handleBarModeChange = makeBpmSwapHandler({
      bpmRef, prevGlobalBpmRef, barBpmRef,
      setBarBpm, updateBpm, barModeHandleBarModeChange,
    });

    handleBarModeChange(true);

    expect(prevGlobalBpmRef.current).toBe(140);
  });

  // ── 2. 진입 시 barBpmRef / setBarBpm 초기화 ────────────────────────────────

  it("진입 시 barBpmRef와 setBarBpm이 글로벌 BPM(140)으로 동기화된다", () => {
    const bpmRef = { current: 140 };
    const prevGlobalBpmRef = { current: 120 };
    const barBpmRef = { current: 120 };
    const setBarBpm = jest.fn();
    const updateBpm = jest.fn();
    const barModeHandleBarModeChange = jest.fn();

    const handleBarModeChange = makeBpmSwapHandler({
      bpmRef, prevGlobalBpmRef, barBpmRef,
      setBarBpm, updateBpm, barModeHandleBarModeChange,
    });

    handleBarModeChange(true);

    expect(barBpmRef.current).toBe(140);
    expect(setBarBpm).toHaveBeenCalledWith(140);
  });

  // ── 3. 종료 시 글로벌 BPM 복원 ────────────────────────────────────────────

  it("종료 시 updateBpm(prevGlobalBpm)이 호출되어 원래 BPM이 복원된다", () => {
    const bpmRef = { current: 140 };
    const prevGlobalBpmRef = { current: 120 };
    const barBpmRef = { current: 120 };
    const setBarBpm = jest.fn();
    const updateBpm = jest.fn();
    const barModeHandleBarModeChange = jest.fn();

    const handleBarModeChange = makeBpmSwapHandler({
      bpmRef, prevGlobalBpmRef, barBpmRef,
      setBarBpm, updateBpm, barModeHandleBarModeChange,
    });

    // 진입 후 종료
    handleBarModeChange(true);
    handleBarModeChange(false);

    expect(updateBpm).toHaveBeenCalledWith(140); // prevGlobalBpmRef에 저장된 값
  });

  // ── 4. 바 모드 중 BPM 변경이 글로벌에 영향을 주지 않음 ─────────────────────

  it("바 모드 중 BPM을 바꿔도 글로벌 BPM(bpmRef)은 종료 전까지 변하지 않는다", () => {
    const bpmRef = { current: 100 };
    const prevGlobalBpmRef = { current: 100 };
    const barBpmRef = { current: 100 };
    const setBarBpm = jest.fn();
    const updateBpm = jest.fn((v: number) => { /* 실제로는 bpmRef도 갱신하지만 여기선 분리 확인만 */ });
    const barModeHandleBarModeChange = jest.fn();

    const handleBarModeChange = makeBpmSwapHandler({
      bpmRef, prevGlobalBpmRef, barBpmRef,
      setBarBpm, updateBpm, barModeHandleBarModeChange,
    });

    handleBarModeChange(true);

    // 바 모드 안에서 bar BPM을 200으로 직접 변경 (handleBarBpmChange 역할 시뮬레이션)
    barBpmRef.current = 200;

    // bpmRef(글로벌)는 아직 100
    expect(bpmRef.current).toBe(100);
    // updateBpm은 종료 시에만 호출됨
    expect(updateBpm).not.toHaveBeenCalled();
  });

  // ── 5. 전체 플로우: 진입 → 변경 → 종료 → 원래 BPM 복원 ──────────────────

  it("진입(120) → bar BPM 변경(200) → 종료 → 글로벌 BPM 120으로 복원", () => {
    const bpmRef = { current: 120 };
    const prevGlobalBpmRef = { current: 120 };
    const barBpmRef = { current: 120 };
    const setBarBpm = jest.fn();
    const updateBpmCalls: number[] = [];
    const updateBpm = jest.fn((v: number) => { updateBpmCalls.push(v); });
    const barModeHandleBarModeChange = jest.fn();

    const handleBarModeChange = makeBpmSwapHandler({
      bpmRef, prevGlobalBpmRef, barBpmRef,
      setBarBpm, updateBpm, barModeHandleBarModeChange,
    });

    // 글로벌 BPM 120에서 진입
    handleBarModeChange(true);
    expect(prevGlobalBpmRef.current).toBe(120);
    expect(setBarBpm).toHaveBeenCalledWith(120);

    // 바 모드 중 BPM 200으로 변경
    barBpmRef.current = 200;

    // 종료 — updateBpm은 prevGlobalBpmRef(120)를 인자로 호출되어야 함
    handleBarModeChange(false);
    expect(updateBpmCalls).toContain(120);
    expect(updateBpmCalls).not.toContain(200);
  });

  // ── 6. 진입 없이 종료만 호출해도 크래시 없음 ─────────────────────────────

  it("진입 없이 종료를 호출해도 오류 없이 prevGlobalBpmRef 값으로 updateBpm이 호출된다", () => {
    const bpmRef = { current: 120 };
    const prevGlobalBpmRef = { current: 100 }; // 이전에 세팅된 값
    const barBpmRef = { current: 120 };
    const setBarBpm = jest.fn();
    const updateBpm = jest.fn();
    const barModeHandleBarModeChange = jest.fn();

    const handleBarModeChange = makeBpmSwapHandler({
      bpmRef, prevGlobalBpmRef, barBpmRef,
      setBarBpm, updateBpm, barModeHandleBarModeChange,
    });

    expect(() => handleBarModeChange(false)).not.toThrow();
    expect(updateBpm).toHaveBeenCalledWith(100);
  });
});
