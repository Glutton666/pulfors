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
import { Platform } from "react-native";
import { usePolygonMode } from "@/hooks/usePolygonMode";
import type { UsePolygonModeParams } from "@/hooks/usePolygonMode";
import { computeVertexAngles, computeLayerLayout, sortLayersForDisplay, computeHitTargets } from "@/components/polygon-mode/PolygonTypes";
import type { PolygonLayer } from "@/components/polygon-mode/PolygonTypes";

// ── 모듈 모킹 ─────────────────────────────────────────────────────────────

jest.mock("@/lib/audio-utils", () => {
  const safePlay = jest.fn();
  // safePlayWithVolume: 실제 구현과 동일하게 player.volume (동기) 설정 후 safePlay 호출
  const safePlayWithVolume = jest.fn(function(player: any, volume: number, label: string) {
    if (player && typeof player.volume === "number") {
      try { player.volume = Math.max(0, Math.min(1, volume)); } catch (_) {}
    }
    safePlay(player, label);
  });
  return { safePlay, safePlayWithVolume };
});
jest.mock("@/lib/audio-renderer", () => ({
  playWebClick: jest.fn(),
  scheduleWebClickAt: jest.fn(),
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
    beatsPerMeasure: 4,
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

/** fake timers를 ms만큼 진행한다 (예약된 폴리곤 이벤트 발화) */
function advanceMs(ms: number) {
  act(() => { jest.advanceTimersByTime(ms); });
}

// ─────────────────────────────────────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────────────────────────────────────

describe("usePolygonMode — engine callback driven", () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    Platform.OS = originalPlatformOS;
  });

  // ── 1. 4박자 롤오버 ─────────────────────────────────────────────────────

  // bpm=120, beatsPerMeasure=4 → 마디 2000ms. 4각형 슬롯 간격 500ms = 비트 간격.
  // 비트별 예약: 각 비트에서 해당 구간의 슬롯이 delay 0으로 즉시 발화한다.
  it("4-sided layer: vertex cycles 0→1→2→3 across the measure's beats, 0 at next measure", () => {
    const params = makeParams();
    const { result } = renderHook(() => usePolygonMode(params));

    // enabled=true이면 핸들러가 등록된다
    expect(params.engineBeatCallbackRef.current).not.toBeNull();

    const layerId = result.current.layers[0].id;

    for (const expected of [0, 1, 2, 3, 0]) {
      fireBeat(params.engineBeatCallbackRef);
      expect(result.current.activeVertices[layerId]).toBe(expected);
    }
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

  it("each scheduled slot fires exactly once per measure (no duplicates)", () => {
    const params = makeParams();
    const { result } = renderHook(() => usePolygonMode(params));

    const layerId = result.current.layers[0].id;
    const vertices: number[] = [];

    for (let b = 0; b < 8; b++) {
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

    // 비트 3개 발화 → vertex 2까지
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

  // ── 8. 레이어 삭제 시 해당 레이어 타이머만 취소 ────────────────────────

  it("deleting a layer cancels only that layer's pending timers, not others", () => {
    const clearTimeoutSpy = jest.spyOn(globalThis, "clearTimeout");
    const setTimeoutSpy = jest.spyOn(globalThis, "setTimeout");

    const params = makeParams({ enabled: true });
    const { result } = renderHook(() => usePolygonMode(params));

    const layerId0 = result.current.layers[0].id;

    // 레이어 2개 추가 (레이어 0 + 레이어 1)
    act(() => { result.current.handleAddLayer(); });
    const layerId1 = result.current.layers[1].id;

    // 두 레이어 모두 오프셋 설정
    act(() => {
      result.current.handleUpdateLayer(layerId0, { offsets: [0.25, 0.25, 0.25, 0.25] });
      result.current.handleUpdateLayer(layerId1, { offsets: [0.25, 0.25, 0.25] });
    });

    // 비트 발화 → 두 레이어 모두 setTimeout 예약됨
    clearTimeoutSpy.mockClear();
    setTimeoutSpy.mockClear();
    fireBeat(params.engineBeatCallbackRef);

    const scheduledCount = setTimeoutSpy.mock.calls.length;
    expect(scheduledCount).toBeGreaterThan(0);

    // 레이어 0 삭제 → clearTimeout이 호출돼야 한다
    clearTimeoutSpy.mockClear();
    act(() => { result.current.handleDeleteLayer(layerId0); });
    expect(clearTimeoutSpy).toHaveBeenCalled();

    // 레이어 1은 여전히 존재
    expect(result.current.layers.find((l) => l.id === layerId1)).toBeDefined();

    clearTimeoutSpy.mockRestore();
    setTimeoutSpy.mockRestore();
  });

  // ── 9. Native round-robin: 같은 soundSet+role 레이어가 다른 슬롯 선택 ──
  //
  // Platform.OS는 jest 환경에서 "ios"(native)로 설정되어 있다.
  // safePlay mock을 통해 어떤 player 객체가 호출됐는지 추적한다.

  // ── 10. handleVertexBeatTypeCycle: S→A→N→M→S 순환 ──────────────────────

  it("handleVertexBeatTypeCycle cycles A → N → M → S → A without touching other vertices", () => {
    const params = makeParams();
    const { result } = renderHook(() => usePolygonMode(params));

    const layerId = result.current.layers[0].id;
    // 기본 role은 high이므로 빈 beatTypes의 첫 꼭짓점은 accent(A)로 fallback한다.
    expect(result.current.layers[0].beatTypes.length).toBe(0);

    // 첫 탭: A → N
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 0); });
    expect(result.current.layers[0].beatTypes[0]).toBe("normal");
    // 다른 꼭짓점은 role fallback A를 유지하고 변경되지 않는다.
    expect(result.current.layers[0].beatTypes[1]).toBe("accent");

    // N → M → S → A
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 0); });
    expect(result.current.layers[0].beatTypes[0]).toBe("mute");
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 0); });
    expect(result.current.layers[0].beatTypes[0]).toBe("strong");
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 0); });
    expect(result.current.layers[0].beatTypes[0]).toBe("accent");
  });

  it("cycling one vertex preserves other vertices' effective role fallback", () => {
    const params = makeParams();
    const { result } = renderHook(() => usePolygonMode(params));
    const layerId = result.current.layers[0].id;

    // 기본 role=high(A): 첫 꼭짓점만 A → N, 나머지는 A를 유지한다.
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 0); });
    expect(result.current.layers[0].beatTypes).toEqual(["normal", "accent", "accent", "accent"]);

    // role=strong(S)에서도 선택한 꼭짓점만 S → A가 되고 나머지는 S다.
    act(() => { result.current.handleUpdateLayer(layerId, { role: "strong" }); });
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 1); });
    expect(result.current.layers[0].beatTypes).toEqual(["strong", "accent", "strong", "strong"]);
  });

  // ── 10. mute 꼭짓점: 4박 주기 유지, 뮤트 슬롯은 소리·비주얼만 생략 ────

  it("mute vertex keeps measure period: slot 2 muted → silent at its slot time, 0·1·3 fire", () => {
    const { safePlay } = require("@/lib/audio-utils");
    const mkPool = () => ({
      strongA: {}, strongB: {}, strongC: {}, strongD: {},
      highA: {}, highB: {}, highC: {}, highD: {},
      lowA: {}, lowB: {}, lowC: {}, lowD: {},
    });
    const params = makeParams({ allPlayersRef: { current: { classic: mkPool() } as any } });
    const { result } = renderHook(() => usePolygonMode(params));

    const layerId = result.current.layers[0].id;

    // vertex 2를 mute로 만든다 (기본 A → N → M)
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 2); });
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 2); });
    expect(result.current.layers[0].beatTypes[2]).toBe("mute");

    (safePlay as jest.Mock).mockClear();

    // beat 0 → k=0
    fireBeat(params.engineBeatCallbackRef);
    expect(result.current.activeVertices[layerId]).toBe(0);

    fireBeat(params.engineBeatCallbackRef); // beat 1 → k=1
    expect(result.current.activeVertices[layerId]).toBe(1);

    fireBeat(params.engineBeatCallbackRef); // beat 2 → k=2 뮤트 → 소리 없음 + 비주얼 꺼짐
    expect(result.current.activeVertices[layerId]).toBeUndefined();

    fireBeat(params.engineBeatCallbackRef); // beat 3 → k=3
    expect(result.current.activeVertices[layerId]).toBe(3);

    // 마디 전체에서 소리는 3회만 (뮤트 슬롯 제외)
    expect((safePlay as jest.Mock).mock.calls.length).toBe(3);

    fireBeat(params.engineBeatCallbackRef); // 새 마디 시작 → 주기 유지
    expect(result.current.activeVertices[layerId]).toBe(0);
  });

  // ── 마디 중 레이어 편집: 옛 데이터로 예약된 잔여 이벤트 취소 ────────────

  it("editing a layer mid-beat cancels its pending scheduled events", () => {
    const clearTimeoutSpy = jest.spyOn(globalThis, "clearTimeout");
    const params = makeParams();
    const { result } = renderHook(() => usePolygonMode(params));

    const layerId = result.current.layers[0].id;
    // 3각형: beat 1에서 k=1이 166.67ms 지연으로 예약된다
    act(() => { result.current.handleUpdateLayer(layerId, { sides: 3 }); });

    fireBeat(params.engineBeatCallbackRef); // beat 0 → k=0 즉시
    expect(result.current.activeVertices[layerId]).toBe(0);
    fireBeat(params.engineBeatCallbackRef); // beat 1 → k=1 예약 (아직 미발화)

    // sides 변경 → 이 레이어의 잔여 타이머가 취소돼야 한다
    clearTimeoutSpy.mockClear();
    act(() => { result.current.handleUpdateLayer(layerId, { sides: 4 }); });
    expect(clearTimeoutSpy).toHaveBeenCalled();

    // 잔여 시간이 흘러도 옛 스케줄(k=1)이 발화하지 않는다
    advanceMs(2000);
    expect(result.current.activeVertices[layerId]).toBe(0);

    clearTimeoutSpy.mockRestore();
  });

  // ── BPM 변경: 다음 엔진 비트부터 새 타이밍이 자동 반영 ─────────────────

  it("BPM change applies from the next engine beat (slot delays scale)", () => {
    const setTimeoutSpy = jest.spyOn(globalThis, "setTimeout");
    const params = makeParams(); // bpm=120 → beat 500ms, 3각형 슬롯 666.67ms
    const { result, rerender } = renderHook(
      (p: UsePolygonModeParams) => usePolygonMode(p),
      { initialProps: params },
    );
    const layerId = result.current.layers[0].id;
    act(() => { result.current.handleUpdateLayer(layerId, { sides: 3 }); });

    fireBeat(params.engineBeatCallbackRef); // beat 0 → k=0 즉시

    setTimeoutSpy.mockClear();
    fireBeat(params.engineBeatCallbackRef); // beat 1 → k=1 delay 666.67-500=166.67
    let delays = setTimeoutSpy.mock.calls.map((c: any[]) => c[1] as number);
    expect(delays.length).toBe(1);
    expect(delays[0]).toBeCloseTo(2000 / 3 - 500, 1);
    advanceMs(200); // k=1 발화
    expect(result.current.activeVertices[layerId]).toBe(1);

    // BPM 120→60: beat 1000ms, 마디 4000ms, 슬롯 1333.33ms.
    rerender({ ...params, bpm: 60 });

    setTimeoutSpy.mockClear();
    fireBeat(params.engineBeatCallbackRef); // beat 2 → k=2 slot 2666.67, beatStart 2000 → delay 666.67
    delays = setTimeoutSpy.mock.calls.map((c: any[]) => c[1] as number);
    expect(delays.length).toBe(1);
    expect(delays[0]).toBeCloseTo(8000 / 3 - 2000, 1);
    advanceMs(700);
    expect(result.current.activeVertices[layerId]).toBe(2);

    setTimeoutSpy.mockRestore();
  });

  it("meter change re-anchors phase: next engine callback is treated as measure start", () => {
    const params = makeParams(); // beatsPerMeasure=4
    const { result, rerender } = renderHook(
      (p: UsePolygonModeParams) => usePolygonMode(p),
      { initialProps: params },
    );
    const layerId = result.current.layers[0].id;

    fireBeat(params.engineBeatCallbackRef); // beat 0 → k=0
    fireBeat(params.engineBeatCallbackRef); // beat 1 → k=1
    expect(result.current.activeVertices[layerId]).toBe(1);

    // 박자표 4→3: 엔진은 비트 카운터를 0으로 리셋하므로
    // 폴리곤도 다음 콜백을 마디 시작으로 인식해야 한다.
    rerender({ ...params, beatsPerMeasure: 3 });

    fireBeat(params.engineBeatCallbackRef); // 새 마디 시작 → k=0 즉시
    expect(result.current.activeVertices[layerId]).toBe(0);
  });

  // ── 폴리리듬: 3각형+4각형이 마디를 각각 3·4등분 ─────────────────────────

  it("polyrhythm: 4-sided and 3-sided layers divide the measure into 4 and 3 slots", () => {
    const setTimeoutSpy = jest.spyOn(globalThis, "setTimeout");
    const params = makeParams();
    const { result } = renderHook(() => usePolygonMode(params));

    // 레이어 추가 → sides = 4-1 = 3
    act(() => { result.current.handleAddLayer(); });
    expect(result.current.layers[1].sides).toBe(3);

    // bpm=120, 4박 → 마디 2000ms. 4각형 슬롯 500ms(각 비트 delay 0, 예약 없음),
    // 3각형 슬롯 666.67ms → beat1에서 166.67ms, beat2에서 333.33ms 예약.
    setTimeoutSpy.mockClear();
    fireBeat(params.engineBeatCallbackRef); // beat 0: 두 레이어 모두 k=0 즉시
    expect(setTimeoutSpy.mock.calls.length).toBe(0);

    fireBeat(params.engineBeatCallbackRef); // beat 1
    let delays = setTimeoutSpy.mock.calls.map((c: any[]) => c[1] as number);
    expect(delays.length).toBe(1);
    expect(delays[0]).toBeCloseTo(2000 / 3 - 500, 1); // 3각형 k=1

    setTimeoutSpy.mockClear();
    fireBeat(params.engineBeatCallbackRef); // beat 2
    delays = setTimeoutSpy.mock.calls.map((c: any[]) => c[1] as number);
    expect(delays.length).toBe(1);
    expect(delays[0]).toBeCloseTo(4000 / 3 - 1000, 1); // 3각형 k=2

    setTimeoutSpy.mockClear();
    fireBeat(params.engineBeatCallbackRef); // beat 3: 예약할 슬롯 없음
    expect(setTimeoutSpy.mock.calls.length).toBe(0);

    setTimeoutSpy.mockRestore();
  });

  // ── 오프셋이 비트 경계를 넘는 경우: 소유 비트에서 예약된 타이머가 1회 발화 ──

  it("offset pushing a slot past its owning beat still fires exactly once at offset time", () => {
    const params = makeParams(); // bpm=120, 4박 → beat 500ms
    const { result } = renderHook(() => usePolygonMode(params));
    const layerId = result.current.layers[0].id;
    // 3각형(슬롯 666.67ms), k=1 오프셋 0.5 → 발화 시각 666.67+333.33=1000ms (beat1 구간 밖)
    act(() => {
      result.current.handleUpdateLayer(layerId, { sides: 3, offsets: [0, 0.5, 0] });
    });

    fireBeat(params.engineBeatCallbackRef); // beat 0 → k=0
    fireBeat(params.engineBeatCallbackRef); // beat 1 → k=1 delay 500ms 예약

    advanceMs(495);
    expect(result.current.activeVertices[layerId]).toBe(0); // 아직 미발화
    advanceMs(5); // FP 오차 포함 ≈500ms 지점에 발화
    expect(result.current.activeVertices[layerId]).toBe(1);

    advanceMs(2000); // 중복 발화 없음
    expect(result.current.activeVertices[layerId]).toBe(1);
  });

  // ── 비정수 비율(5각형/4박): 각 비트가 자기 구간의 슬롯만 예약 ──────────

  it("5-sided over 4 beats: each beat schedules only its own slots with correct delays", () => {
    const setTimeoutSpy = jest.spyOn(globalThis, "setTimeout");
    const params = makeParams(); // beat 500ms, 5각형 슬롯 400ms
    const { result } = renderHook(() => usePolygonMode(params));
    act(() => { result.current.handleUpdateLayer(result.current.layers[0].id, { sides: 5 }); });

    // beat별 예상: b0 → k=1(400ms), b1 → k=2(300ms), b2 → k=3(200ms), b3 → k=4(100ms)
    const expected = [[400], [300], [200], [100]];
    for (const exp of expected) {
      setTimeoutSpy.mockClear();
      fireBeat(params.engineBeatCallbackRef);
      const delays = setTimeoutSpy.mock.calls.map((c: any[]) => c[1] as number);
      expect(delays.length).toBe(exp.length);
      delays.forEach((d, i) => expect(d).toBeCloseTo(exp[i], 1));
    }
    setTimeoutSpy.mockRestore();
  });

  // ── Web Audio clock: 소리는 JS 타이머가 아닌 AudioContext 미래 시점에 예약 ──

  it("web schedules every 4:4 polygon click against one AudioContext clock", () => {
    Platform.OS = "web";
    const renderer = require("@/lib/audio-renderer");
    const handles = Array.from({ length: 4 }, () => ({ cancel: jest.fn() }));
    renderer.getWebAudioContext.mockReturnValue({ currentTime: 10 });
    renderer.scheduleWebClickAt.mockImplementation(() => handles.shift() ?? { cancel: jest.fn() });

    const params = makeParams();
    renderHook(() => usePolygonMode(params));
    fireBeat(params.engineBeatCallbackRef);

    const scheduledAt = (renderer.scheduleWebClickAt as jest.Mock).mock.calls.map(
      (call: any[]) => call[3],
    );
    expect(scheduledAt).toEqual([10, 10.5, 11, 11.5]);
  });

  it("web PCM layers call AudioBufferSource.start with future AudioContext times", () => {
    Platform.OS = "web";
    const renderer = require("@/lib/audio-renderer");
    const starts = jest.fn();
    const audioContext = {
      currentTime: 30,
      destination: {},
      createBuffer: jest.fn(() => ({ getChannelData: () => ({ set: jest.fn() }) })),
      createBufferSource: jest.fn(() => ({
        connect: jest.fn(),
        disconnect: jest.fn(),
        start: starts,
        stop: jest.fn(),
      })),
      createGain: jest.fn(() => ({
        connect: jest.fn(),
        disconnect: jest.fn(),
        gain: { value: 0 },
      })),
    };
    renderer.getWebAudioContext.mockReturnValue(audioContext);
    const pcms = {
      strong: new Float32Array([0, 1]),
      high: new Float32Array([0, 1]),
      low: new Float32Array([0, 1]),
    };
    const params = makeParams({ clickPCMCacheRef: { current: { classic: pcms } } });
    renderHook(() => usePolygonMode(params));

    fireBeat(params.engineBeatCallbackRef);
    expect(starts.mock.calls.map((call: any[]) => call[0])).toEqual([30, 30.5, 31, 31.5]);
  });

  it("web advances the next measure from its prior AudioContext anchor, not callback arrival", () => {
    Platform.OS = "web";
    const renderer = require("@/lib/audio-renderer");
    const audioContext = { currentTime: 10 };
    renderer.getWebAudioContext.mockReturnValue(audioContext);
    renderer.scheduleWebClickAt.mockImplementation(() => ({ cancel: jest.fn() }));

    const params = makeParams();
    renderHook(() => usePolygonMode(params));
    fireBeat(params.engineBeatCallbackRef); // measure 1 anchor = 10
    fireBeat(params.engineBeatCallbackRef, 3);
    audioContext.currentTime = 11.99; // next engine callback arrives just before its 12.0 audio anchor
    fireBeat(params.engineBeatCallbackRef);

    const scheduledAt = (renderer.scheduleWebClickAt as jest.Mock).mock.calls
      .slice(4)
      .map((call: any[]) => call[3]);
    expect(scheduledAt).toEqual([12, 12.5, 13, 13.5]);
  });

  it("web aligns 5:4 and 3:4 layers to the same high-BPM AudioContext measure", () => {
    Platform.OS = "web";
    const renderer = require("@/lib/audio-renderer");
    renderer.getWebAudioContext.mockReturnValue({ currentTime: 2 });
    renderer.scheduleWebClickAt.mockImplementation(() => ({ cancel: jest.fn() }));

    const params = makeParams({ bpm: 300 });
    const { result } = renderHook(() => usePolygonMode(params));
    const firstId = result.current.layers[0].id;
    act(() => { result.current.handleUpdateLayer(firstId, { sides: 5 }); });
    act(() => { result.current.handleAddLayer(); });
    const secondId = result.current.layers[1].id;
    act(() => { result.current.handleUpdateLayer(secondId, { sides: 3 }); });

    fireBeat(params.engineBeatCallbackRef);

    const scheduledAt = (renderer.scheduleWebClickAt as jest.Mock).mock.calls.map(
      (call: any[]) => call[3] as number,
    );
    // 300 BPM·4박 마디 = 0.8초. 5각형과 3각형 모두 시각 2.0에서 시작한다.
    expect(scheduledAt.slice(0, 5)).toEqual([2, 2.16, 2.32, 2.48, 2.64]);
    expect(scheduledAt.slice(5)).toEqual([2, 2 + 0.8 / 3, 2 + 1.6 / 3]);
  });

  it("web cancels already-scheduled audio when a layer is edited or playback stops", () => {
    Platform.OS = "web";
    const renderer = require("@/lib/audio-renderer");
    const handles = Array.from({ length: 8 }, () => ({ cancel: jest.fn() }));
    renderer.getWebAudioContext.mockReturnValue({ currentTime: 20 });
    renderer.scheduleWebClickAt.mockImplementation(() => handles.shift() ?? { cancel: jest.fn() });

    const params = makeParams();
    const { result, rerender } = renderHook(
      (next: UsePolygonModeParams) => usePolygonMode(next),
      { initialProps: params },
    );
    fireBeat(params.engineBeatCallbackRef);
    const scheduled = (renderer.scheduleWebClickAt as jest.Mock).mock.results
      .map((entry: any) => entry.value)
      .filter(Boolean);
    expect(scheduled).toHaveLength(4);

    act(() => { result.current.handleUpdateLayer(result.current.layers[0].id, { sides: 3 }); });
    scheduled.forEach((handle: { cancel: jest.Mock }) => expect(handle.cancel).toHaveBeenCalledTimes(1));

    renderer.scheduleWebClickAt.mockClear();
    fireBeat(params.engineBeatCallbackRef);
    const replacement = (renderer.scheduleWebClickAt as jest.Mock).mock.results
      .map((entry: any) => entry.value)
      .filter(Boolean);
    expect(replacement).toHaveLength(2);

    rerender({ ...params, isPlaying: false });
    replacement.forEach((handle: { cancel: jest.Mock }) => expect(handle.cancel).toHaveBeenCalledTimes(1));
  });

  it("web cancels all old sources before BPM or meter replacements", () => {
    Platform.OS = "web";
    const renderer = require("@/lib/audio-renderer");
    const handles = Array.from({ length: 16 }, () => ({ cancel: jest.fn() }));
    renderer.getWebAudioContext.mockReturnValue({ currentTime: 40 });
    renderer.scheduleWebClickAt.mockImplementation(() => handles.shift() ?? { cancel: jest.fn() });

    const params = makeParams();
    const { rerender } = renderHook(
      (next: UsePolygonModeParams) => usePolygonMode(next),
      { initialProps: params },
    );
    fireBeat(params.engineBeatCallbackRef);
    const initial = (renderer.scheduleWebClickAt as jest.Mock).mock.results.map((entry: any) => entry.value);

    rerender({ ...params, bpm: 240 });
    initial.forEach((handle: { cancel: jest.Mock }) => expect(handle.cancel).toHaveBeenCalledTimes(1));
    renderer.scheduleWebClickAt.mockClear();
    fireBeat(params.engineBeatCallbackRef);
    expect((renderer.scheduleWebClickAt as jest.Mock).mock.calls.length).toBeGreaterThan(0);

    const bpmReplacement = (renderer.scheduleWebClickAt as jest.Mock).mock.results.map((entry: any) => entry.value);
    rerender({ ...params, bpm: 240, beatsPerMeasure: 3 });
    bpmReplacement.forEach((handle: { cancel: jest.Mock }) => expect(handle.cancel).toHaveBeenCalledTimes(1));
    renderer.scheduleWebClickAt.mockClear();
    fireBeat(params.engineBeatCallbackRef);
    // 3/4에서도 4각형은 한 마디를 네 번으로 나눈다.
    expect((renderer.scheduleWebClickAt as jest.Mock).mock.calls).toHaveLength(4);
  });

  // ── getClickPCMs 참조 변경 시 엔진 핸들러가 재등록되지 않음 ────────────

  it("changing getClickPCMs identity does not re-register the engine handler", () => {
    const params = makeParams();
    const { rerender } = renderHook(
      (p: UsePolygonModeParams) => usePolygonMode(p),
      { initialProps: params },
    );
    const handlerBefore = params.engineBeatCallbackRef.current;
    expect(handlerBefore).not.toBeNull();

    // 새 함수 참조로 교체 (재생 중 PCM 로더가 재생성되는 상황)
    rerender({
      ...params,
      getClickPCMs: jest.fn().mockResolvedValue({
        strong: new Float32Array(), high: new Float32Array(), low: new Float32Array(),
      }),
    });

    expect(params.engineBeatCallbackRef.current).toBe(handlerBefore);
  });

  it("all-muted layer is absent from activeVertices (no pulse)", () => {
    const { safePlay } = require("@/lib/audio-utils");
    (safePlay as jest.Mock).mockClear();

    const params = makeParams();
    const { result } = renderHook(() => usePolygonMode(params));

    const layerId = result.current.layers[0].id;

    // 4개 꼭짓점 모두 mute로 설정 (role: "low" → all 'normal', then cycle each to mute)
    act(() => { result.current.handleUpdateLayer(layerId, { role: "low" }); });
    // 이제 beatTypes = ['normal','normal','normal','normal']
    // 각각 cycle 1번: normal → mute
    for (let i = 0; i < 4; i++) {
      act(() => { result.current.handleVertexBeatTypeCycle(layerId, i); });
    }
    expect(result.current.layers[0].beatTypes.every((bt: string) => bt === "mute")).toBe(true);

    (safePlay as jest.Mock).mockClear();
    fireBeat(params.engineBeatCallbackRef);

    // 전체 mute → activeVertices에 해당 레이어 없음, safePlay 미호출
    expect(result.current.activeVertices[layerId]).toBeUndefined();
    expect((safePlay as jest.Mock).mock.calls.length).toBe(0);
  });

  // ── 11. sides 변경 시 beatTypes 크기 조정 ───────────────────────────────

  it("changing sides resizes beatTypes, preserving existing values and defaulting new ones", () => {
    // 초기 beatTypes는 []이며, 꼭짓점을 M까지 순환해 배열을 명시적으로 채운다.
    const params = makeParams();
    const { result } = renderHook(() => usePolygonMode(params));

    const layerId = result.current.layers[0].id;

    // A(role fallback) → N → M
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 2); });
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 2); });
    // 이제 beatTypes = ["accent", "accent", "mute", "accent"]

    // sides를 6으로 늘린다
    act(() => {
      result.current.handleUpdateLayer(layerId, { sides: 6 });
    });
    const bt6 = result.current.layers[0].beatTypes;
    expect(bt6.length).toBe(6);
    // 기존 4개 값 보존: [0]=accent, [2]=mute
    expect(bt6[0]).toBe("accent");
    expect(bt6[2]).toBe("mute");
    // 새로 추가된 꼭짓점은 normal
    expect(bt6[4]).toBe("normal");
    expect(bt6[5]).toBe("normal");

    // 다시 3으로 줄이면 앞 3개만 남는다
    act(() => {
      result.current.handleUpdateLayer(layerId, { sides: 3 });
    });
    expect(result.current.layers[0].beatTypes.length).toBe(3);
    expect(result.current.layers[0].beatTypes[2]).toBe("mute"); // 뮤트 상태 보존
  });

  // ── 12. role 변경 시 모든 꼭짓점 beatType 동기화 ─────────────────────────

  it("changing role in handleUpdateLayer resets all beatTypes to match the new role", () => {
    const params = makeParams();
    const { result } = renderHook(() => usePolygonMode(params));

    const layerId = result.current.layers[0].id;

    // vertex 1, 2를 초기 fallback A와 다른 값으로 변경해 둔다.
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 1); }); // A → N
    act(() => { result.current.handleVertexBeatTypeCycle(layerId, 2); }); // A → N

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

    // classic 플레이어 풀 목 구성
    const highA = { play: jest.fn(), name: "highA" };
    const highB = { play: jest.fn(), name: "highB" };
    const highC = { play: jest.fn(), name: "highC" };
    const highD = { play: jest.fn(), name: "highD" };
    const classicPool = {
      strongA: {}, strongB: {}, strongC: {}, strongD: {},
      highA, highB, highC, highD,
      lowA: {}, lowB: {}, lowC: {}, lowD: {},
    };

    const allPlayersRef = { current: { classic: classicPool } as any };
    const params = makeParams({ allPlayersRef });
    const { result } = renderHook(() => usePolygonMode(params));

    // 레이어 2개 모두 classic 사운드셋 (빈 beatTypes의 role fallback은 high=accent)
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

    // 첫 비트 발화 (absbeat=0 → vertexIdx=0 → beatType='accent')
    (safePlay as jest.Mock).mockClear();
    fireBeat(params.engineBeatCallbackRef);

    const calls = (safePlay as jest.Mock).mock.calls;
    // 두 레이어가 각각 1회 safePlay를 호출해야 한다
    expect(calls.length).toBe(2);

    // 각 호출에서 전달된 player 객체가 달라야 한다 (A → B)
    const players = calls.map((c: any[]) => c[0]);
    expect(players[0]).not.toBe(players[1]);
    expect(players[0]).toBe(highA);
    expect(players[1]).toBe(highB);
  });
  // ── 14. 네이티브 레이어 볼륨: setVolumeAsync가 layerVol × globalVol 값으로 호출됨 ────

  it("native playback calls setVolumeAsync with layerVol × globalVol on each beat", () => {
    // ExpoAudioPlayer 계약에 맞게 동기 volume 프로퍼티를 가진 플레이어 목
    const trackablePlayer = { play: jest.fn(), volume: 1.0 };
    const classicPool = {
      strongA: {}, strongB: {}, strongC: {}, strongD: {},
      highA: trackablePlayer, highB: {}, highC: {}, highD: {},
      lowA: {}, lowB: {}, lowC: {}, lowD: {},
    };
    const volumeRef = { current: 0.8 }; // 전역 볼륨 0.8
    const allPlayersRef = { current: { classic: classicPool } as any };
    const params = makeParams({ allPlayersRef, volumeRef });
    const { result } = renderHook(() => usePolygonMode(params));

    const layerId = result.current.layers[0].id;
    // 레이어 볼륨을 0.5로 설정
    act(() => { result.current.handleUpdateLayer(layerId, { volume: 0.5 }); });

    // 비트 발화: 첫 슬롯 = highA (trackablePlayer)
    fireBeat(params.engineBeatCallbackRef);

    // player.volume이 layerVol(0.5) × globalVol(0.8) = 0.4 로 설정되어야 한다
    expect(trackablePlayer.volume).toBeCloseTo(0.4, 5);
    // safePlay도 즉시(동기) 호출되어야 한다
    const { safePlay: safePlayMock } = require("@/lib/audio-utils");
    expect(safePlayMock).toHaveBeenCalledWith(trackablePlayer, "polygon.beat");
  });
  // ── 15. sides 변경 후 네이티브 경로가 normal(low) 풀을 사용하는지 확인 ─────
  // beatTypes가 빈 배열인 상태에서 sides를 변경하면 새 꼭짓점이 모두 "normal"이어야 한다.
  // (이전 코드는 vertex 0을 "strong"으로 초기화해 strong 풀을 잘못 선택했음)

  it("changing sides expands beatTypes with 'normal' — low pool is used on native, not strong", () => {
    const { safePlay } = require("@/lib/audio-utils");
    const lowA = { play: jest.fn(), volume: 1.0, name: "lowA" };
    const classicPool = {
      strongA: {}, strongB: {}, strongC: {}, strongD: {},
      highA: {}, highB: {}, highC: {}, highD: {},
      lowA, lowB: {}, lowC: {}, lowD: {},
    };
    const allPlayersRef = { current: { classic: classicPool } as any };
    const params = makeParams({ allPlayersRef });
    const { result } = renderHook(() => usePolygonMode(params));

    const layerId = result.current.layers[0].id;

    // sides를 6으로 늘린다 — 새 꼭짓점은 "normal"이어야 한다
    act(() => { result.current.handleUpdateLayer(layerId, { sides: 6 }); });
    const bts = result.current.layers[0].beatTypes;
    // 기존 4개는 "normal" (초기 beatTypes가 빈 배열 → normal 확장)
    // 새로 추가된 2개도 "normal"
    expect(bts.every((bt: string) => bt === "normal")).toBe(true);

    // 비트 발화 → role="high"지만 beatType이 "normal" → low 풀 선택
    (safePlay as jest.Mock).mockClear();
    fireBeat(params.engineBeatCallbackRef);
    advanceMs(500); // 슬롯 타이머 발화 대기

    // strong 풀은 호출되지 않아야 한다
    const calls = (safePlay as jest.Mock).mock.calls;
    const strongPlayers = [classicPool.strongA, classicPool.strongB, classicPool.strongC, classicPool.strongD];
    const anyStrongCalled = calls.some((c: any[]) => strongPlayers.includes(c[0]));
    expect(anyStrongCalled).toBe(false);
  });

  // ── 16. BPM 변경 시 미발화 슬롯 취소 (다음 비트부터 새 BPM) ─────────────

  it("changing BPM cancels pending slots so they do not fire at the old tempo", () => {
    const { safePlay } = require("@/lib/audio-utils");
    const params = makeParams({ bpm: 120, beatsPerMeasure: 4 });
    const { rerender } = renderHook(
      (props: UsePolygonModeParams) => usePolygonMode(props),
      { initialProps: params },
    );

    // 첫 비트 발화 → 4각형 슬롯 0이 즉시 예약됨 (delay≈0ms)
    act(() => { params.engineBeatCallbackRef.current?.(); });

    // BPM을 변경하면 대기 중인 슬롯 타이머가 취소되어야 한다.
    const nextParams = { ...params, bpm: 200 };
    rerender(nextParams);

    // 이전 BPM 기준 타이머가 모두 취소됐으므로, 가짜 타이머를 진행해도
    // 추가 safePlay 호출이 없어야 한다.
    const callsBefore = (safePlay as jest.Mock).mock.calls.length;
    advanceMs(2000); // 120 BPM 기준 최대 오프셋 범위를 훨씬 초과
    const callsAfter = (safePlay as jest.Mock).mock.calls.length;
    expect(callsAfter).toBe(callsBefore); // 취소된 슬롯은 발화하지 않아야 한다
  });

  // ── 16. 폴리곤 모드 닫기/열기 시 레이어 설정 보존 ────────────────────────

  it("disabling and re-enabling preserves configured layers", () => {
    const params = makeParams();
    const { result, rerender } = renderHook(
      (props: UsePolygonModeParams) => usePolygonMode(props),
      { initialProps: params },
    );

    const layerId = result.current.layers[0].id;

    // 변 수를 6으로 변경하고 레이어를 추가해 2-레이어 구성을 만든다
    act(() => { result.current.handleUpdateLayer(layerId, { sides: 6 }); });
    act(() => { result.current.handleAddLayer(); });
    expect(result.current.layers).toHaveLength(2);
    expect(result.current.layers[0].sides).toBe(6);

    // 폴리곤 모드 비활성화 (enabled=false)
    rerender({ ...params, enabled: false });

    // 다시 활성화 (enabled=true)
    rerender({ ...params, enabled: true });

    // 레이어 설정이 보존되어야 한다
    expect(result.current.layers).toHaveLength(2);
    expect(result.current.layers[0].sides).toBe(6);

    // 재생 상태(activeVertices)는 초기화되어야 한다
    expect(result.current.activeVertices).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeVertexAngles — 순수 함수 단위 테스트
// ─────────────────────────────────────────────────────────────────────────────

function makeLayer(overrides: Partial<PolygonLayer> = {}): PolygonLayer {
  return {
    id: "test",
    sides: 4,
    color: "#FF0000",
    soundSet: "classic",
    role: "high",
    volume: 1.0,
    offsets: [],
    beatTypes: ["strong", "normal", "normal", "normal"],
    ...overrides,
  };
}

describe("computeVertexAngles", () => {
  const TWO_PI = 2 * Math.PI;

  // ── 1. 오프셋 없음 → 정 N각형 균등 분할 ────────────────────────────────

  it("no offsets and no mutes: angles equal regular polygon spacing", () => {
    const layer = makeLayer({ sides: 4, offsets: [], beatTypes: ["strong", "normal", "normal", "normal"] });
    const { activeAngles, activeIndices } = computeVertexAngles(layer);
    expect(activeAngles.length).toBe(4);
    expect(activeIndices).toEqual([0, 1, 2, 3]);

    // 각도 간격이 2π/4 = π/2 에 가까워야 한다
    const spacing = TWO_PI / 4;
    for (let i = 1; i < 4; i++) {
      expect(activeAngles[i] - activeAngles[i - 1]).toBeCloseTo(spacing, 6);
    }
  });

  it("no offsets and no mutes: all non-mute → sum of arc spans equals 2π", () => {
    for (const sides of [3, 4, 5, 6, 8]) {
      const bt = Array.from({ length: sides }, (_, i) => i === 0 ? "strong" : "normal") as PolygonLayer["beatTypes"];
      const layer = makeLayer({ sides, offsets: [], beatTypes: bt });
      const { activeAngles } = computeVertexAngles(layer);
      // 마지막 꼭짓점에서 처음 꼭짓점까지 span 포함
      const lastSpan = (activeAngles[0] + TWO_PI) - activeAngles[sides - 1];
      const spans = activeAngles.slice(1).map((a, i) => a - activeAngles[i]).concat(lastSpan);
      const total = spans.reduce((s, x) => s + x, 0);
      expect(total).toBeCloseTo(TWO_PI, 5);
    }
  });

  // ── 2. 오프셋 적용 → 해당 꼭짓점이 다음 방향으로 이동 ──────────────────

  it("non-zero offset shifts the vertex angle forward", () => {
    // 모두 active (4꼭짓점), vertex 0에 오프셋 0.25 적용
    // 이동량 = 0.25 * (2π/n) = 0.25 * (2π/4) = π/8
    const layer = makeLayer({
      sides: 4,
      offsets: [0.25, 0, 0, 0],
      beatTypes: ["strong", "normal", "normal", "normal"],
    });
    const plain = computeVertexAngles(makeLayer({ sides: 4, offsets: [], beatTypes: ["strong", "normal", "normal", "normal"] }));
    const shifted = computeVertexAngles(layer);

    // vertex 0(k=0)의 각도가 plain보다 커야 한다
    expect(shifted.activeAngles[0]).toBeGreaterThan(plain.activeAngles[0]);
    // 나머지 꼭짓점은 변동 없음
    expect(shifted.activeAngles[1]).toBeCloseTo(plain.activeAngles[1], 6);
    expect(shifted.activeAngles[2]).toBeCloseTo(plain.activeAngles[2], 6);
    expect(shifted.activeAngles[3]).toBeCloseTo(plain.activeAngles[3], 6);

    // 이동량 검증: 0.25 * (2π / 4)
    expect(shifted.activeAngles[0] - plain.activeAngles[0]).toBeCloseTo(0.25 * (TWO_PI / 4), 6);
  });

  // ── 3. Mute 꼭짓점 제외 → active는 원래 정N각형 위치 유지, mute는 유령 위치 ──

  it("mute vertex excluded: active vertices keep original N-gon positions, mute at ghost position", () => {
    // vertex 2 muted → active: [0,1,3], mute: [2]
    // active 꼭짓점은 정 4각형 원래 각도 유지 → 이등변삼각형
    const bt: PolygonLayer["beatTypes"] = ["strong", "normal", "mute", "normal"];
    const layer = makeLayer({ sides: 4, offsets: [], beatTypes: bt });
    const result = computeVertexAngles(layer);

    expect(result.activeIndices).toEqual([0, 1, 3]);
    expect(result.muteIndices).toEqual([2]);

    // active 꼭짓점들이 정 4각형 원래 각도 유지 (0 → -π/2, 1 → 0, 3 → π)
    const arc = TWO_PI / 4;
    expect(result.activeAngles[0]).toBeCloseTo(-Math.PI / 2, 6);
    expect(result.activeAngles[1]).toBeCloseTo(-Math.PI / 2 + arc, 6);
    expect(result.activeAngles[2]).toBeCloseTo(-Math.PI / 2 + arc * 3, 6);

    // mute 꼭짓점(2)은 정 4각형 원래 각도 (i=2 → -π/2 + 2·(2π/4) = π/2)
    expect(result.muteAngles[0]).toBeCloseTo(-Math.PI / 2 + 2 * (TWO_PI / 4), 6);

    // mute 꼭짓점에 오프셋을 줘도 muteAngles는 변하지 않아야 한다
    const withOffset = makeLayer({ sides: 4, offsets: [0, 0, 0.4, 0], beatTypes: bt });
    const result2 = computeVertexAngles(withOffset);
    expect(result2.muteAngles[0]).toBeCloseTo(-Math.PI / 2 + 2 * (TWO_PI / 4), 6);
  });

  it("offset scale uses 2π/sides even when some vertices are muted", () => {
    // vertex 2 muted, vertex 1에 오프셋 0.5 → 이동량은 0.5 * (2π/4) (active 수 3과 무관)
    const bt: PolygonLayer["beatTypes"] = ["strong", "normal", "mute", "normal"];
    const plain = computeVertexAngles(makeLayer({ sides: 4, offsets: [], beatTypes: bt }));
    const shifted = computeVertexAngles(
      makeLayer({ sides: 4, offsets: [0, 0.5, 0, 0], beatTypes: bt }),
    );
    // activeIndices = [0,1,3] → vertex 1은 k=1
    expect(shifted.activeAngles[1] - plain.activeAngles[1]).toBeCloseTo(0.5 * (TWO_PI / 4), 6);
    // 다른 active 꼭짓점은 그대로
    expect(shifted.activeAngles[0]).toBeCloseTo(plain.activeAngles[0], 6);
    expect(shifted.activeAngles[2]).toBeCloseTo(plain.activeAngles[2], 6);
  });

  it("all mutes: no active vertices, all at regular polygon ghost positions", () => {
    const bt: PolygonLayer["beatTypes"] = ["mute", "mute", "mute", "mute"];
    const layer = makeLayer({ sides: 4, offsets: [], beatTypes: bt });
    const result = computeVertexAngles(layer);

    expect(result.activeAngles).toHaveLength(0);
    expect(result.activeIndices).toHaveLength(0);

    const regular = [0, 1, 2, 3].map((i) => -Math.PI / 2 + (TWO_PI * i) / 4);
    expect(result.muteAngles).toHaveLength(4);
    result.muteAngles.forEach((a, i) => expect(a).toBeCloseTo(regular[i], 6));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeLayerLayout — 중앙 허브·동일 반지름 레이아웃 단위 테스트
// ─────────────────────────────────────────────────────────────────────────────

describe("computeLayerLayout", () => {
  const SIZE = 300;
  const CENTER = SIZE / 2;

  function layoutFor(layers: PolygonLayer[]) {
    return computeLayerLayout(sortLayersForDisplay(layers), SIZE);
  }

  it("empty input returns empty array", () => {
    expect(computeLayerLayout([], SIZE)).toEqual([]);
  });

  it("single layer: center is the central hub", () => {
    const [l] = layoutFor([makeLayer({ sides: 4 })]);
    expect(l.cx).toBeCloseTo(CENTER, 6);
    expect(l.cy).toBeCloseTo(CENTER, 6);
  });

  it("multiple non-pulse layers share the hub and the same radius", () => {
    const layers = [
      makeLayer({ id: "a", sides: 3, beatTypes: ["strong", "normal", "normal"] }),
      makeLayer({ id: "b", sides: 6, beatTypes: ["strong", "normal", "normal", "normal", "normal", "normal"] }),
      makeLayer({ id: "c", sides: 4 }),
    ];
    const layouts = layoutFor(layers);
    // 정렬 순서와 무관하게 모두 중앙 허브와 동일 반지름을 공유한다.
    for (const l of layouts) {
      expect(l.cx).toBeCloseTo(CENTER, 6);
      expect(l.cy).toBeCloseTo(CENTER, 6);
      expect(l.r).toBeCloseTo(layouts[0].r, 6);
    }
  });

  it("same-sides layers share the hub and grow in insertion order", () => {
    const layers = [
      makeLayer({ id: "a", sides: 4 }),
      makeLayer({ id: "b", sides: 4 }),
    ];
    const layouts = layoutFor(layers);
    expect(layouts[1].r).toBeGreaterThan(layouts[0].r);
    expect(layouts[0].cx).toBeCloseTo(layouts[1].cx, 6);
    expect(layouts[0].cy).toBeCloseTo(layouts[1].cy, 6);
  });

  it("4+ same-sides layers all share the center and grow by 10px", () => {
    const layers = ["a", "b", "c", "d"].map((id) => makeLayer({ id, sides: 4 }));
    const layouts = layoutFor(layers);
    for (let i = 0; i < layouts.length; i++) {
      expect(layouts[i].cx).toBeCloseTo(CENTER, 6);
      expect(layouts[i].cy).toBeCloseTo(CENTER, 6);
      if (i > 0) {
        expect(layouts[i].r - layouts[i - 1].r).toBeCloseTo(10, 6);
      }
    }
  });

  it("compresses crowded same-sides layers inside the canvas margin", () => {
    const layers = Array.from({ length: 8 }, (_, index) =>
      makeLayer({ id: `layer-${index}`, sides: 4 }),
    );
    const layouts = layoutFor(layers);
    const maxRadius = SIZE / 2 - 20;

    expect(layouts.at(-1)!.r).toBeCloseTo(maxRadius, 6);
    expect(layouts.every((layout) => layout.r <= maxRadius)).toBe(true);
  });

  it("same pulse layers share the hub and grow slightly in insertion order", () => {
    const layers = [
      makeLayer({ id: "first", sides: 1 }),
      makeLayer({ id: "second", sides: 1 }),
      makeLayer({ id: "third", sides: 1 }),
    ];
    const layouts = layoutFor(layers);

    for (const layout of layouts) {
      expect(layout.cx).toBeCloseTo(CENTER, 6);
      expect(layout.cy).toBeCloseTo(CENTER, 6);
    }
    expect(layouts[1].r).toBeGreaterThan(layouts[0].r);
    expect(layouts[2].r).toBeGreaterThan(layouts[1].r);
    expect(layouts[1].r - layouts[0].r).toBeCloseTo(10, 6);
    expect(layouts[2].r - layouts[1].r).toBeCloseTo(10, 6);
  });

  it("computeHitTargets: editing mode routes all targets to the editing layer only", () => {
    // 같은 변 수 2개 → 꼭짓점이 ±2px 이내로 겹침
    const layers = sortLayersForDisplay([
      makeLayer({ id: "a", sides: 4 }),
      makeLayer({ id: "b", sides: 4 }),
    ]);
    const layouts = computeLayerLayout(layers, SIZE);

    // 편집 모드: "a" 레이어만 타깃 생성
    const editing = computeHitTargets(layers, layouts, SIZE, "a");
    expect(editing.length).toBe(4);
    expect(editing.every((t) => t.layerId === "a")).toBe(true);

    // 비편집 모드: 두 레이어 모두 (4 + 4)
    const all = computeHitTargets(layers, layouts, SIZE, null);
    expect(all.length).toBe(8);
    expect(new Set(all.map((t) => t.layerId))).toEqual(new Set(["a", "b"]));
  });

  it("computeHitTargets: includes mute-ghost vertices and sides=1 center target", () => {
    const layers = sortLayersForDisplay([
      makeLayer({ id: "p", sides: 1, beatTypes: ["strong"] }),
      makeLayer({ id: "m", sides: 4, beatTypes: ["strong", "mute", "normal", "normal"] }),
    ]);
    const layouts = computeLayerLayout(layers, SIZE);
    const targets = computeHitTargets(layers, layouts, SIZE, null);
    // m: 3 active + 1 mute, p: 1 center
    expect(targets.length).toBe(5);
    expect(targets.filter((t) => t.layerId === "m").map((t) => t.vertexIdx).sort()).toEqual([0, 1, 2, 3]);
    const pTarget = targets.find((t) => t.layerId === "p")!;
    expect(pTarget.x).toBeCloseTo(SIZE / 2, 6);
    expect(pTarget.y).toBeCloseTo(SIZE / 2, 6);
  });

  it("mixed sides: only matching sides receive the overlap offset", () => {
    const layers = [
      makeLayer({ id: "a", sides: 4 }),
      makeLayer({ id: "b", sides: 4 }),
      makeLayer({ id: "c", sides: 3, beatTypes: ["strong", "normal", "normal"] }),
    ];
    const layouts = layoutFor(layers);
    expect(layouts[1].r).toBeGreaterThan(layouts[0].r);
    expect(layouts[2].r).toBeCloseTo(layouts[0].r, 6);
    for (const layout of layouts) {
      expect(layout.cx).toBeCloseTo(SIZE / 2, 6);
      expect(layout.cy).toBeCloseTo(SIZE / 2, 6);
    }
  });
});
