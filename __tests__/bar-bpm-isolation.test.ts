/**
 * @jest-environment jsdom
 *
 * 바 모드 독립 BPM 회귀 테스트
 *
 * 검증 항목:
 *  1. barBpm 초기값이 120
 *  2. handleBarBpmChange — 정상 값 전파 (onBarBpmChange 호출 + 상태 갱신)
 *  3. handleBarBpmChange — 하한 클램프 (20 미만 → 20)
 *  4. handleBarBpmChange — 상한 클램프 (300 초과 → 300)
 *  5. handleBarQuickSave — 저장 항목에 barBpm이 사용됨 (글로벌 BPM 아님)
 */

import { renderHook, act } from "@testing-library/react";
import { useBarMode } from "@/hooks/useBarMode";
import type { UseBarModeParams } from "@/hooks/useBarMode";

// ── 모듈 모킹 ──────────────────────────────────────────────────────────────

jest.mock("@/lib/metronome-engine", () => ({
  toEngineBpm: (bpm: number) => bpm,
}));

jest.mock("@/lib/storage", () => ({
  loadPracticeBook: jest.fn().mockResolvedValue([]),
  savePracticeBook: jest.fn().mockResolvedValue(undefined),
  createPracticeEntry: jest.fn().mockImplementation(
    (label: string, config: Record<string, unknown>, username: string) => ({
      id: "test-id",
      label,
      username,
      createdAt: new Date().toISOString(),
      ...config,
    }),
  ),
}));

jest.mock("@/app/index.helpers", () => ({
  createInitialBarConfig: () => ({
    beatsPerMeasure: 0,
    beatTypes: [],
    beatSubdivisions: {},
    barRepeats: {},
    loopBlocks: [],
    barClockMode: "stopwatch",
    barTimerDuration: 180,
    noteSamples: {},
    noteSampleNames: {},
    noteSampleSources: {},
    noteSampleChannels: {},
    noteSampleVolumes: {},
    barLoopMode: "once",
    blockPlayMode: "loop",
    hasBeenConfigured: false,
  }),
  defaultBeatTypes: (beats: number) => Array.from(
    { length: beats },
    (_, index) => (index === 0 ? "strong" : "normal"),
  ),
  applyLoopBlocksChange: jest.fn(),
}));

jest.mock("@/lib/note-samples", () => ({
  saveNoteSamples: jest.fn(),
  saveNoteSampleNames: jest.fn(),
  saveNoteSampleSources: jest.fn(),
  saveNoteSampleChannels: jest.fn(),
  saveNoteSampleVolumes: jest.fn(),
  saveNoteSampleSpeeds: jest.fn(),
}));

jest.mock("@/lib/sample-cache", () => ({
  releaseAll: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/error-tracking", () => ({
  captureBreadcrumb: jest.fn(),
}));

// ── 헬퍼 ───────────────────────────────────────────────────────────────────

function makeEngine() {
  return {
    setBpm: jest.fn(),
    setBeatsPerMeasure: jest.fn(),
    setBeatTypes: jest.fn(),
    setAllBeatSubdivisions: jest.fn(),
    clearLoopBlocks: jest.fn(),
    clearBarRepeats: jest.fn(),
    setBarRepeat: jest.fn(),
    setBarBpmOverride: jest.fn(),
    setAllBarRepeats: jest.fn(),
    setAllBarBpmOverrides: jest.fn(),
    setLoopBlocks: jest.fn(),
    setBlockPlayMode: jest.fn(),
    flushSchedule: jest.fn(),
    stop: jest.fn(),
  };
}

function makeParams(
  overrides?: Partial<UseBarModeParams>,
): UseBarModeParams {
  return {
    engineRef: { current: makeEngine() as any },
    barModeRef: { current: false },
    setBarMode: jest.fn(),
    dialConfigRef: {
      current: {
        beatsPerMeasure: 4,
        beatTypes: [],
        beatSubdivisions: {},
        noteSamples: {},
        noteSampleNames: {},
        noteSampleSources: {},
        noteSampleChannels: {},
      },
    },
    stopIfPlaying: jest.fn(),
    isPlayingRef: { current: false },
    beatsPerMeasure: 4,
    setBeatsPerMeasure: jest.fn(),
    beatTypes: [],
    setBeatTypes: jest.fn(),
    beatSubdivisions: {},
    setBeatSubdivisions: jest.fn(),
    subdivisionPattern: [],
    setSubdivisionPattern: jest.fn(),
    noteSamples: {},
    setNoteSamples: jest.fn(),
    noteSamplesRef: { current: {} },
    noteSampleNames: {},
    setNoteSampleNames: jest.fn(),
    noteSampleNamesRef: { current: {} },
    noteSampleSources: {},
    setNoteSampleSources: jest.fn(),
    noteSampleSourcesRef: { current: {} },
    noteSampleChannels: {},
    setNoteSampleChannels: jest.fn(),
    noteSampleChannelsRef: { current: {} },
    noteSampleVolumes: {},
    setNoteSampleVolumes: jest.fn(),
    noteSampleVolumesRef: { current: {} },
    noteSampleSpeeds: {},
    setNoteSampleSpeeds: jest.fn(),
    noteSampleSpeedsRef: { current: {} },
    setNoteSampleMetroChannels: jest.fn(),
    noteSampleMetroChannelsRef: { current: {} },
    noteSampleSoundsRef: { current: {} },
    samplePlayStateRef: { current: {} },
    preloadNoteSampleSounds: jest.fn(),
    onBarBpmChange: jest.fn(),
    beatDenominatorRef: { current: 4 },
    username: "test-user",
    persistSettings: jest.fn(),
    scheduleReRender: jest.fn(),
    t: ((k: string) => k) as any,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────────────────────────────────────

describe("useBarMode — barBpm 독립 BPM", () => {

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. 초기값 ─────────────────────────────────────────────────────────────

  it("barBpm 초기값은 120이다", () => {
    const params = makeParams();
    const { result } = renderHook(() => useBarMode(params));
    expect(result.current.barBpm).toBe(120);
  });

  // ── 2. 정상 BPM 변경 ─────────────────────────────────────────────────────

  it("handleBarBpmChange(150) → barBpm=150, onBarBpmChange(150) 호출", () => {
    const onBarBpmChange = jest.fn();
    const params = makeParams({ onBarBpmChange });
    const { result } = renderHook(() => useBarMode(params));

    act(() => { result.current.handleBarBpmChange(150); });

    expect(result.current.barBpm).toBe(150);
    expect(result.current.barBpmRef.current).toBe(150);
    expect(onBarBpmChange).toHaveBeenCalledTimes(1);
    expect(onBarBpmChange).toHaveBeenCalledWith(150);
  });

  // ── 3. 하한 클램프 ────────────────────────────────────────────────────────

  it("handleBarBpmChange(5) → 20으로 클램프, onBarBpmChange(20) 호출", () => {
    const onBarBpmChange = jest.fn();
    const params = makeParams({ onBarBpmChange });
    const { result } = renderHook(() => useBarMode(params));

    act(() => { result.current.handleBarBpmChange(5); });

    expect(result.current.barBpm).toBe(20);
    expect(onBarBpmChange).toHaveBeenCalledWith(20);
  });

  // ── 4. 상한 클램프 ────────────────────────────────────────────────────────

  it("handleBarBpmChange(400) → 300으로 클램프, onBarBpmChange(300) 호출", () => {
    const onBarBpmChange = jest.fn();
    const params = makeParams({ onBarBpmChange });
    const { result } = renderHook(() => useBarMode(params));

    act(() => { result.current.handleBarBpmChange(400); });

    expect(result.current.barBpm).toBe(300);
    expect(onBarBpmChange).toHaveBeenCalledWith(300);
  });

  // ── 5. 빠른 저장에 barBpm 사용 ────────────────────────────────────────────

  it("handleBarQuickSave는 barBpm을 연습 항목 BPM으로 저장한다", async () => {
    const { savePracticeBook, createPracticeEntry } =
      require("@/lib/storage") as {
        savePracticeBook: jest.Mock;
        createPracticeEntry: jest.Mock;
      };

    const onBarBpmChange = jest.fn();
    const params = makeParams({ onBarBpmChange, beatsPerMeasure: 4 });
    const { result } = renderHook(() => useBarMode(params));

    // barBpm을 200으로 변경한 뒤 저장
    act(() => { result.current.handleBarBpmChange(200); });

    let saved = false;
    await act(async () => { saved = await result.current.handleBarQuickSave(); });

    expect(saved).toBe(true);
    // createPracticeEntry에 전달된 config의 bpm이 200이어야 한다
    const configArg = createPracticeEntry.mock.calls[0][1] as { bpm: number };
    expect(configArg.bpm).toBe(200);
    expect(savePracticeBook).toHaveBeenCalled();
  });

  // ── 6. 연속 변경 시 마지막 값만 남는다 ────────────────────────────────────

  it("BPM을 여러 번 바꾸면 마지막 값이 최종 barBpm이 된다", () => {
    const onBarBpmChange = jest.fn();
    const params = makeParams({ onBarBpmChange });
    const { result } = renderHook(() => useBarMode(params));

    act(() => {
      result.current.handleBarBpmChange(80);
      result.current.handleBarBpmChange(140);
      result.current.handleBarBpmChange(200);
    });

    expect(result.current.barBpm).toBe(200);
    expect(onBarBpmChange).toHaveBeenLastCalledWith(200);
  });

  it("바 초기화는 엔진뿐 아니라 화면용 서브디비전 패턴도 기본값으로 되돌린다", () => {
    const setSubdivisionPattern = jest.fn();
    const params = makeParams({
      subdivisionPattern: ["strong", "normal", "mute"],
      setSubdivisionPattern,
    });
    const { result } = renderHook(() => useBarMode(params));

    act(() => { result.current.handleBarReset(); });

    expect(setSubdivisionPattern).toHaveBeenCalledWith(["accent"]);
    expect(params.engineRef.current?.setAllBeatSubdivisions).toHaveBeenCalledWith({});
  });
});
