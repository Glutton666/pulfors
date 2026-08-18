/**
 * @jest-environment jsdom
 *
 * usePolygonMode 회귀 테스트
 *
 * 엔진 콜백 ref 기반 비트 구동을 검증:
 *  1. 4/4 박자(4비트) 롤오버: 4박마다 꼭짓점이 0으로 순환
 *  2. 1/4 박자(1비트): 매 비트마다 꼭짓점 0 (단 1개이므로 항상 0)
 *  3. disabled 시: 핸들러 null, 비주얼 상태 초기화
 *  4. 재생 중단: absoluteBeat 리셋 → 재개 시 0부터 시작
 *  5. 오프셋 취소(enabled→false): 대기 중 setTimeout 정리
 *  6. 각 비트당 정확히 1회 발화 (중복 없음)
 */

import React from "react";
import { renderHook, act } from "@testing-library/react";
import { usePolygonMode } from "@/hooks/usePolygonMode";
import type { UsePolygonModeParams } from "@/hooks/usePolygonMode";

// ── 모듈 모킹 ─────────────────────────────────────────────────────────────

jest.mock("@/lib/audio-utils", () => ({ safePlay: jest.fn() }));
jest.mock("@/lib/audio-renderer", () => ({
  playWebClick: jest.fn(),
  getWebAudioContext: jest.fn(() => null),
}));
jest.mock("expo-crypto", () => ({
  randomUUID: () => `test-uuid-${Math.random()}`,
}));

// ── 헬퍼 ─────────────────────────────────────────────────────────────────

function makeParams(
  overrides?: Partial<UsePolygonModeParams>,
): UsePolygonModeParams {
  const engineBeatCallbackRef = { current: null as (() => void) | null };
  return {
    enabled: true,
    isPlaying: true,
    engineBeatCallbackRef,
    bpm: 120,
    allPlayersRef: { current: {} as any },
    clickPCMCacheRef: { current: {} },
    volumeRef: { current: 0.75 },
    getClickPCMs: jest.fn().mockResolvedValue({ strong: new Float32Array(), high: new Float32Array(), low: new Float32Array() }),
    ...overrides,
  };
}

/** 엔진 콜백을 N회 발화한다 */
function fireBeat(ref: React.MutableRefObject<(() => void) | null>, times = 1) {
  for (let i = 0; i < times; i++) {
    act(() => { ref.current?.(); });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────────────────────────────────────

describe("usePolygonMode — engine callback driven", () => {

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── 1. 4박자 롤오버 ─────────────────────────────────────────────────────

  it("4-sided layer: vertex cycles 0→1→2→3→0 across 5 beats", () => {
    const params = makeParams();
    const { result } = renderHook(() => usePolygonMode(params));

    // enabled=true이면 핸들러가 등록된다
    expect(params.engineBeatCallbackRef.current).not.toBeNull();

    const layerId = result.current.layers[0].id;

    fireBeat(params.engineBeatCallbackRef); // beat 0 → vertex 0
    expect(result.current.activeVertices[layerId]).toBe(0);

    fireBeat(params.engineBeatCallbackRef); // beat 1 → vertex 1
    expect(result.current.activeVertices[layerId]).toBe(1);

    fireBeat(params.engineBeatCallbackRef); // beat 2 → vertex 2
    expect(result.current.activeVertices[layerId]).toBe(2);

    fireBeat(params.engineBeatCallbackRef); // beat 3 → vertex 3
    expect(result.current.activeVertices[layerId]).toBe(3);

    fireBeat(params.engineBeatCallbackRef); // beat 4 → vertex 0 (rollover)
    expect(result.current.activeVertices[layerId]).toBe(0);
  });

  // ── 2. 1박자 박자표 ──────────────────────────────────────────────────────

  it("1-sided layer (circle): always vertex 0 regardless of beat count", () => {
    const params = makeParams();
    const { result } = renderHook(() => usePolygonMode(params));

    act(() => {
      result.current.handleUpdateLayer(result.current.layers[0].id, { sides: 1 });
    });

    const layerId = result.current.layers[0].id;

    // 10번 발화해도 항상 vertex 0
    for (let i = 0; i < 10; i++) {
      fireBeat(params.engineBeatCallbackRef);
      expect(result.current.activeVertices[layerId]).toBe(0);
    }
  });

  // ── 3. 정확히 1회 발화 (중복 없음) ─────────────────────────────────────

  it("each engine fire advances vertex exactly once (no duplicates)", () => {
    const params = makeParams();
    const { result } = renderHook(() => usePolygonMode(params));

    const layerId = result.current.layers[0].id;
    const vertices: number[] = [];

    for (let i = 0; i < 8; i++) {
      fireBeat(params.engineBeatCallbackRef);
      vertices.push(result.current.activeVertices[layerId]);
    }

    // 0→1→2→3→0→1→2→3
    expect(vertices).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
  });

  // ── 4. disabled → 핸들러 해제 + 상태 초기화 ────────────────────────────

  it("when enabled becomes false: callback ref is nulled and activeVertices cleared", () => {
    const params = makeParams({ enabled: true });
    const { result, rerender } = renderHook(
      (p: UsePolygonModeParams) => usePolygonMode(p),
      { initialProps: params },
    );

    // 몇 비트 발화 후 상태 채움
    fireBeat(params.engineBeatCallbackRef, 2);
    expect(Object.keys(result.current.activeVertices).length).toBeGreaterThan(0);

    // enabled=false로 변경
    const disabledParams = { ...params, enabled: false };
    rerender(disabledParams);

    expect(params.engineBeatCallbackRef.current).toBeNull();
    expect(result.current.activeVertices).toEqual({});
  });

  // ── 5. 재생 중단 → absoluteBeat 리셋 ────────────────────────────────────

  it("when isPlaying becomes false and back to true: vertices restart from 0", () => {
    const params = makeParams({ enabled: true, isPlaying: true });
    const { result, rerender } = renderHook(
      (p: UsePolygonModeParams) => usePolygonMode(p),
      { initialProps: params },
    );

    // 3비트 발화
    fireBeat(params.engineBeatCallbackRef, 3);

    const layerId = result.current.layers[0].id;
    expect(result.current.activeVertices[layerId]).toBe(2); // 0→1→2

    // 재생 중단 → absoluteBeat 리셋
    rerender({ ...params, isPlaying: false });

    // 재개
    rerender({ ...params, isPlaying: true });

    // 핸들러가 아직 있으므로 다시 발화 시 0부터 시작
    fireBeat(params.engineBeatCallbackRef);
    expect(result.current.activeVertices[layerId]).toBe(0);
  });

  // ── 6. 오프셋 타이머 정리 (enabled=false) ──────────────────────────────

  it("pending offset timers are cleared when enabled becomes false", () => {
    const clearTimeoutSpy = jest.spyOn(globalThis, "clearTimeout");
    const params = makeParams({ enabled: true });
    const { result, rerender } = renderHook(
      (p: UsePolygonModeParams) => usePolygonMode(p),
      { initialProps: params },
    );

    // 오프셋 있는 레이어로 업데이트
    act(() => {
      result.current.handleUpdateLayer(result.current.layers[0].id, {
        offsets: [0.25, 0.25, 0.25, 0.25],
      });
    });

    // 비트 발화 → setTimeout이 예약됨
    fireBeat(params.engineBeatCallbackRef);

    // enabled=false → clearTimeout이 호출돼야 한다
    rerender({ ...params, enabled: false });
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  // ── 7. 오프셋 타이머 정리 (unmount) ────────────────────────────────────

  it("pending offset timers are cleared on unmount", () => {
    const clearTimeoutSpy = jest.spyOn(globalThis, "clearTimeout");
    const params = makeParams({ enabled: true });
    const { result, unmount } = renderHook(() => usePolygonMode(params));

    // 오프셋 있는 레이어로 업데이트
    act(() => {
      result.current.handleUpdateLayer(result.current.layers[0].id, {
        offsets: [0.25, 0.25, 0.25, 0.25],
      });
    });

    fireBeat(params.engineBeatCallbackRef);
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  // ── 8. Native round-robin: 같은 soundSet+role 레이어가 다른 슬롯 선택 ──
  //
  // Platform.OS는 jest 환경에서 "ios"(native)로 설정되어 있다.
  // safePlay mock을 통해 어떤 player 객체가 호출됐는지 추적한다.

  // ── 9. handleVertexBeatTypeCycle: S→A→N→M→S 순환 ──────────────────────

  it("handleVertexBeatTypeCycle cycles one vertex S→A→N→M→S without touching others", () => {
    const params = makeParams();
    const { result } = renderHook(() => usePolygonMode(params));

    const layerId = result.current.layers[0].id;
    // 기본 beatTypes: [strong, normal, normal, normal]
    expect(result.current.layers[0].beatTypes[0]).toBe("strong");
    expect(result.current.layers[0].beatTypes[1]).toBe("normal");

    // vertex 0: strong → accent
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 0); });
    expect(result.current.layers[0].beatTypes[0]).toBe("accent");
    expect(result.current.layers[0].beatTypes[1]).toBe("normal"); // 나머지 불변

    // accent → normal
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 0); });
    expect(result.current.layers[0].beatTypes[0]).toBe("normal");

    // normal → mute
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 0); });
    expect(result.current.layers[0].beatTypes[0]).toBe("mute");

    // mute → strong (wrap-around)
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 0); });
    expect(result.current.layers[0].beatTypes[0]).toBe("strong");
  });

  // ── 10. mute 꼭짓점: safePlay 억제 ─────────────────────────────────────

  it("mute vertex suppresses safePlay for that beat", () => {
    const { safePlay } = require("@/lib/audio-utils");
    (safePlay as jest.Mock).mockClear();

    const strongA = { play: jest.fn(), name: "strongA" };
    const classicPool = {
      strongA, strongB: {}, strongC: {}, strongD: {},
      highA: {}, highB: {}, highC: {}, highD: {},
      lowA: {}, lowB: {}, lowC: {}, lowD: {},
    };
    const allPlayersRef = { current: { classic: classicPool } as any };
    const params = makeParams({ allPlayersRef });
    const { result } = renderHook(() => usePolygonMode(params));

    const layerId = result.current.layers[0].id;

    // vertex 0을 mute로 만든다 (strong→accent→normal→mute)
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 0); }); // accent
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 0); }); // normal
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 0); }); // mute
    expect(result.current.layers[0].beatTypes[0]).toBe("mute");

    (safePlay as jest.Mock).mockClear();
    fireBeat(params.engineBeatCallbackRef); // absbeat=0 → vertex 0 → mute

    // mute이므로 safePlay가 호출되면 안 된다
    expect((safePlay as jest.Mock).mock.calls.length).toBe(0);
  });

  // ── 11. sides 변경 시 beatTypes 크기 조정 ───────────────────────────────

  it("changing sides resizes beatTypes, preserving existing values and defaulting new ones", () => {
    const params = makeParams();
    const { result } = renderHook(() => usePolygonMode(params));

    const layerId = result.current.layers[0].id;

    // vertex 1을 accent로 변경
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 1); }); // normal→accent... wait, 1 is normal, cycle: normal→mute? No: cycle is S→A→N→M
    // beatTypes[1]은 'normal'이므로 한 번 cycle하면 'mute'? No, let me check the cycle order.
    // cycleVertexBeatType: strong→accent→normal→mute→strong
    // beatTypes[1]은 'normal' → cycle → 'mute'
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 1); }); // normal → mute... wait above act was already done
    // Actually the first act above already cycled vertex 1. Let me just set it properly.
    // beatTypes after first cycle of vertex 1: normal → mute
    // Let me instead cycle vertex 0 to accent and check resize preserves it.

    // 먼저 sides를 6으로 늘린다
    act(() => {
      result.current.handleUpdateLayer(layerId, { sides: 6 });
    });
    const bt6 = result.current.layers[0].beatTypes;
    expect(bt6.length).toBe(6);
    // 기존 4개 값은 유지
    expect(bt6[0]).toBe("strong"); // 원래 strong
    // 새로 추가된 꼭짓점은 normal
    expect(bt6[4]).toBe("normal");
    expect(bt6[5]).toBe("normal");

    // 다시 3으로 줄이면 앞 3개만 남는다
    act(() => {
      result.current.handleUpdateLayer(layerId, { sides: 3 });
    });
    expect(result.current.layers[0].beatTypes.length).toBe(3);
    expect(result.current.layers[0].beatTypes[0]).toBe("strong");
  });

  // ── 12. role 변경 시 모든 꼭짓점 beatType 동기화 ─────────────────────────

  it("changing role in handleUpdateLayer resets all beatTypes to match the new role", () => {
    const params = makeParams();
    const { result } = renderHook(() => usePolygonMode(params));

    const layerId = result.current.layers[0].id;

    // vertex 1, 2를 accent/mute로 변경해 둔다
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 1); }); // normal→mute? No: normal→mute is 3rd step
    // cycle for vertex 1 (starts at 'normal'): normal is 3rd in [strong,accent,normal,mute]
    // cycle: normal → mute (next after normal)
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 2); }); // normal → mute

    // 이제 role을 "high"로 변경 → 모든 꼭짓점이 'accent'가 돼야 한다
    act(() => {
      result.current.handleUpdateLayer(layerId, { role: "high" });
    });
    const bts = result.current.layers[0].beatTypes;
    expect(bts.every((bt: string) => bt === "accent")).toBe(true);
    expect(bts.length).toBe(4);

    // role: "strong" → 모두 'strong'
    act(() => {
      result.current.handleUpdateLayer(layerId, { role: "strong" });
    });
    expect(result.current.layers[0].beatTypes.every((bt: string) => bt === "strong")).toBe(true);

    // role: "low" → 모두 'normal'
    act(() => {
      result.current.handleUpdateLayer(layerId, { role: "low" });
    });
    expect(result.current.layers[0].beatTypes.every((bt: string) => bt === "normal")).toBe(true);
  });

  // ── 13. Native round-robin: 같은 soundSet+role 레이어가 다른 슬롯 선택 ──
  //
  // Platform.OS는 jest 환경에서 "ios"(native)로 설정되어 있다.
  // safePlay mock을 통해 어떤 player 객체가 호출됐는지 추적한다.

  it("two same-set same-beatType layers on same beat select different player slots (A then B)", () => {
    const { safePlay } = require("@/lib/audio-utils");
    (safePlay as jest.Mock).mockClear();

    // classic/strong 플레이어 풀 목 구성
    // beatTypes[0] 기본값이 'strong'이므로 strong 풀을 추적 대상으로 설정한다.
    const strongA = { play: jest.fn(), name: "strongA" };
    const strongB = { play: jest.fn(), name: "strongB" };
    const strongC = { play: jest.fn(), name: "strongC" };
    const strongD = { play: jest.fn(), name: "strongD" };
    const classicPool = {
      strongA, strongB, strongC, strongD,
      highA: {}, highB: {}, highC: {}, highD: {},
      lowA: {}, lowB: {}, lowC: {}, lowD: {},
    };

    const allPlayersRef = { current: { classic: classicPool } as any };
    const params = makeParams({ allPlayersRef });
    const { result } = renderHook(() => usePolygonMode(params));

    // 레이어 2개 모두 classic 사운드셋 (beatTypes[0]='strong' 기본값 유지)
    const layerId0 = result.current.layers[0].id;
    act(() => {
      result.current.handleUpdateLayer(layerId0, { soundSet: "classic" });
    });
    act(() => {
      result.current.handleAddLayer();
    });
    const layerId1 = result.current.layers[1]?.id;
    if (layerId1) {
      act(() => {
        result.current.handleUpdateLayer(layerId1, { soundSet: "classic" });
      });
    }

    // 첫 비트 발화 (absbeat=0 → vertexIdx=0 → beatType='strong')
    (safePlay as jest.Mock).mockClear();
    fireBeat(params.engineBeatCallbackRef);

    const calls = (safePlay as jest.Mock).mock.calls;
    // 두 레이어가 각각 1회 safePlay를 호출해야 한다
    expect(calls.length).toBe(2);

    // 각 호출에서 전달된 player 객체가 달라야 한다 (A → B)
    const players = calls.map((c: any[]) => c[0]);
    expect(players[0]).not.toBe(players[1]);
    // 첫 번째는 strongA, 두 번째는 strongB
    expect(players[0]).toBe(strongA);
    expect(players[1]).toBe(strongB);
  });
});
