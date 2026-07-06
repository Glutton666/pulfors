import { Platform } from "react-native";
import type { BeatType } from "@/lib/metronome-engine";
import type { BarRepeat, LoopBlock } from "@/components/BeatIndicator";
import type { NoteSampleMap, NoteSampleNameMap, NoteSampleSourceMap, NoteSampleChannelMap } from "@/lib/note-samples";
import type { ActivityLog, PracticeSessionData } from "@/lib/activity-log";
import type { PracticeEntry, SoundSet } from "@/lib/storage";

export interface LandscapeStatsTotals {
  todayTotal: number;
  todayBeat: number;
  todayBar: number;
  weekTotal: number;
}

/**
 * 가로화면 통계 위젯 집계.
 * 오늘/이번 주(월요일 기준) 합계와 모드별(dial/bar) 분리.
 * @param logs activity log 배열
 * @param now 기준 시각 (테스트 주입용, 기본값 new Date())
 */
export function computeLandscapeStats(
  logs: ActivityLog[],
  now: Date = new Date(),
): LandscapeStatsTotals {
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  const day = weekStart.getDay();
  const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
  weekStart.setDate(diff); weekStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const weekMs = weekStart.getTime();
  let todayTotal = 0, todayBeat = 0, todayBar = 0, weekTotal = 0;
  for (const l of logs) {
    if (l.type !== "practice_session") continue;
    const d = l.data as PracticeSessionData;
    const dur = d.duration || 0;
    if (l.timestamp >= weekMs) weekTotal += dur;
    if (l.timestamp >= todayMs) {
      todayTotal += dur;
      if (d.mode === "dial") todayBeat += dur;
      else if (d.mode === "bar") todayBar += dur;
    }
  }
  return { todayTotal, todayBeat, todayBar, weekTotal };
}

/**
 * 표준 복합박자(6/8, 9/8, 12/8)에 해당하는 총 박(서브비트) 수인지 판별.
 * 이 앱은 별도의 분자/분모 시간표기 UI가 없고 beatsPerMeasure(총 8분음표 개수)만
 * 다루므로, 6·9·12는 항상 "점4분음표 단위로 3개씩 묶이는 복합박자"로 간주한다.
 */
export function isCompoundMeterBeatCount(beats: number): boolean {
  return beats === 6 || beats === 9 || beats === 12;
}

/**
 * 복합박자에서 큰 박(그룹)이 시작되는 인덱스 목록(3개 단위)을 반환.
 * 예) 6 → [0, 3] (2개 그룹), 9 → [0, 3, 6] (3개 그룹), 12 → [0, 3, 6, 9] (4개 그룹)
 */
export function getCompoundGroupStarts(beats: number): number[] {
  if (!isCompoundMeterBeatCount(beats)) return [];
  const starts: number[] = [];
  for (let i = 0; i < beats; i += 3) starts.push(i);
  return starts;
}

export function defaultBeatTypes(beats: number): BeatType[] {
  if (isCompoundMeterBeatCount(beats)) {
    const groupStarts = new Set(getCompoundGroupStarts(beats));
    return Array.from({ length: beats }, (_, i) =>
      i === 0 ? "strong" : groupStarts.has(i) ? "accent" : "normal"
    );
  }
  return Array.from({ length: beats }, (_, i) =>
    i === 0 ? "accent" : "normal"
  );
}

/**
 * Validate that a noteSample URI is a local resource.
 * Blocks attacker-supplied http/https URIs that would cause outbound network
 * requests from the victim device (SSRF / privacy beacon via deep-link import).
 */
export function isSafeNoteSampleUri(uri: string): boolean {
  const raw = uri.split("#")[0];
  if (raw.startsWith("http://") || raw.startsWith("https://")) return false;
  if (Platform.OS !== "web") {
    return raw.startsWith("file://") || raw.startsWith("asset://");
  }
  return raw.startsWith("blob:") || raw.startsWith("data:") || raw.startsWith("file://");
}

export interface DialConfig {
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  noteSamples: NoteSampleMap;
  noteSampleNames: NoteSampleNameMap;
  noteSampleSources: NoteSampleSourceMap;
  noteSampleChannels: NoteSampleChannelMap;
}

export interface BarConfig {
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  barRepeats: Record<number, BarRepeat>;
  loopBlocks: LoopBlock[];
  barClockMode: "stopwatch" | "timer";
  barTimerDuration: number;
  noteSamples: NoteSampleMap;
  noteSampleNames: NoteSampleNameMap;
  noteSampleSources: NoteSampleSourceMap;
  noteSampleChannels: NoteSampleChannelMap;
  barLoopMode: "loop" | "once";
  blockPlayMode: "sequential" | "loop" | "random";
  hasBeenConfigured: boolean;
}

export function createInitialDialConfig(beats = 4): DialConfig {
  return {
    beatsPerMeasure: beats,
    beatTypes: defaultBeatTypes(beats),
    beatSubdivisions: {},
    noteSamples: {},
    noteSampleNames: {},
    noteSampleSources: {},
    noteSampleChannels: {},
  };
}

/**
 * Fisher-Yates shuffled index array (in-place, then returned).
 * RNG is injectable for deterministic tests.
 */
export function createShuffledIndices(
  length: number,
  rng: () => number = Math.random,
): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

/**
 * Adjust shuffled-mode index array when a new entry is inserted at queueIdx.
 * - All existing indices >= queueIdx shift +1.
 * - The new queueIdx is inserted at pos+1 so it plays right after the current.
 * Returns a new array (does not mutate input).
 */
export function adjustShuffledIndicesOnInsert(
  indices: number[],
  pos: number,
  insertedQueueIdx: number,
): number[] {
  const next = indices.map(i => (i >= insertedQueueIdx ? i + 1 : i));
  next.splice(pos + 1, 0, insertedQueueIdx);
  return next;
}

/**
 * Append a newly added queue item's index to the shuffled-indices array
 * so that random-mode iteration includes it in the current cycle.
 * - If the index already exists (e.g. shuffled array already covered it),
 *   returns the input unchanged.
 * - The new index is placed at the end of the array (after current pos).
 */
export function appendShuffledIndexOnAdd(
  indices: number[],
  appendedQueueIdx: number,
): number[] {
  if (indices.includes(appendedQueueIdx)) return indices;
  return [...indices, appendedQueueIdx];
}

export interface QueueInsertResult<T> {
  queue: T[];
  currentIndex: number;
  shuffledIndices: number[];
}

/**
 * Insert a new entry into the Note-mode queue at `insertAt` and return the
 * adjusted queue / current-index / shuffled-indices triple.
 *
 * Index correction rules (the bug fix targeted by Task #65):
 * - If `insertAt <= currentIndex`, currentIndex must be bumped by +1 so that
 *   it keeps pointing to the same playing entry after the splice.
 * - If `insertAt > currentIndex` or no entry is playing (currentIndex < 0),
 *   currentIndex is unchanged.
 *
 * Shuffled indices are kept consistent for "random" mode:
 * - Append (insertAt === queue.length) → append the new queue index to the
 *   shuffled cycle (only if not already present).
 * - Mid-insert → shift all shuffled entries >= insertAt by +1 and place the
 *   new index right after the current shuffled position.
 */
export function applyQueueInsert<T>(
  queue: T[],
  currentIndex: number,
  shuffledIndices: number[],
  shuffledPos: number,
  mode: "once" | "loop" | "random",
  insertAt: number,
  entry: T,
): QueueInsertResult<T> {
  const pos = Math.max(0, Math.min(insertAt, queue.length));
  const newQueue = [...queue];
  newQueue.splice(pos, 0, entry);

  let newCurrent = currentIndex;
  if (currentIndex >= 0 && pos <= currentIndex) {
    newCurrent = currentIndex + 1;
  }

  let newShuffled = shuffledIndices;
  if (mode === "random") {
    if (pos >= queue.length) {
      newShuffled = appendShuffledIndexOnAdd(shuffledIndices, pos);
    } else {
      newShuffled = adjustShuffledIndicesOnInsert(
        shuffledIndices,
        shuffledPos,
        pos,
      );
    }
  }

  return { queue: newQueue, currentIndex: newCurrent, shuffledIndices: newShuffled };
}

export type BlockPlayMode = "sequential" | "loop" | "random";
export type BarLoopMode = "loop" | "once";

export interface CurrentBarConfigInput {
  barMode: boolean;
  bpm: number;
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  barRepeats: Record<number, BarRepeat>;
  loopBlocks: LoopBlock[];
  barLoopMode: BarLoopMode;
  blockPlayMode: BlockPlayMode;
  subdivisionPattern: BeatType[];
  noteSamples: NoteSampleMap;
  noteSampleNames: NoteSampleNameMap;
  noteSampleSources: NoteSampleSourceMap;
  noteSampleChannels: NoteSampleChannelMap;
  dialConfig: DialConfig;
  barClockMode: "stopwatch" | "timer";
  barTimerDuration: number;
}

export interface CurrentBarConfigOutput {
  mode: "bar" | "beat";
  bpm: number;
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  barRepeats: Record<number, BarRepeat>;
  loopBlocks: LoopBlock[];
  barLoopMode: BarLoopMode;
  blockPlayMode: BlockPlayMode;
  subdivisionPattern: BeatType[];
  barClockMode?: "stopwatch" | "timer";
  barTimerDuration?: number;
  noteSamples: NoteSampleMap;
  noteSampleNames: NoteSampleNameMap;
  noteSampleSources: NoteSampleSourceMap;
  noteSampleChannels: NoteSampleChannelMap;
}

/**
 * Compute currentBarConfig: in barMode return live bar state; otherwise return
 * dial-derived config. All container values are shallow-cloned to keep callers
 * insulated from later mutations.
 */
export function selectCurrentBarConfig(input: CurrentBarConfigInput): CurrentBarConfigOutput {
  if (input.barMode) {
    return {
      mode: "bar",
      bpm: input.bpm,
      beatsPerMeasure: input.beatsPerMeasure,
      beatTypes: [...input.beatTypes],
      beatSubdivisions: { ...input.beatSubdivisions },
      barRepeats: { ...input.barRepeats },
      loopBlocks: [...input.loopBlocks],
      barLoopMode: input.barLoopMode,
      blockPlayMode: input.blockPlayMode,
      subdivisionPattern: [...input.subdivisionPattern],
      barClockMode: input.barClockMode,
      barTimerDuration: input.barTimerDuration,
      noteSamples: { ...input.noteSamples },
      noteSampleNames: { ...input.noteSampleNames },
      noteSampleSources: { ...input.noteSampleSources },
      noteSampleChannels: { ...input.noteSampleChannels },
    };
  }
  const dc = input.dialConfig;
  return {
    mode: "beat",
    bpm: input.bpm,
    beatsPerMeasure: dc.beatsPerMeasure,
    beatTypes: [...dc.beatTypes],
    beatSubdivisions: { ...dc.beatSubdivisions },
    barRepeats: {},
    loopBlocks: [],
    barLoopMode: "once",
    blockPlayMode: "loop",
    subdivisionPattern: [...input.subdivisionPattern],
    noteSamples: { ...dc.noteSamples },
    noteSampleNames: { ...dc.noteSampleNames },
    noteSampleSources: { ...dc.noteSampleSources },
    noteSampleChannels: { ...dc.noteSampleChannels },
  };
}

/**
 * Count subdivisions per beat (selector for beatSubdivisions map).
 */
export function beatSubdivisionCounts(
  beatSubdivisions: Record<string, unknown[]>,
): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const [k, v] of Object.entries(beatSubdivisions)) {
    counts[Number(k)] = v.length;
  }
  return counts;
}

export interface AppliedEntryState {
  bpm: number;
  beatsPerMeasure: number;
  beatTypes: BeatType[];
  beatSubdivisions: Record<string, BeatType[]>;
  barRepeats: Record<number, BarRepeat>;
  loopBlocks: LoopBlock[];
  barLoopMode: BarLoopMode;
  blockPlayMode: BlockPlayMode;
  subdivisionPattern: BeatType[] | null;
  noteSamples: NoteSampleMap;
  noteSampleNames: NoteSampleNameMap;
  noteSampleSources: NoteSampleSourceMap;
  noteSampleChannels: NoteSampleChannelMap;
  bpmOverrides: Record<number, number>;
}

/**
 * Pure reducer mirroring the React-state side effects of applyEntryToEngine.
 * Returns the values that the live component would set on bpm/beatsPerMeasure/
 * note-sample maps/etc when loading the entry. Engine-level calls are
 * deliberately not modeled here; tests can verify state-roundtrip without a
 * real engine instance.
 */
/** loopBlocks.layerOf를 barRepeats.layers로 마이그레이션하는 순수 함수.
 *  layerOf가 있는 블록들을 barRepeats[beat].layers 배열에 통합하고 loopBlocks에서 제거한다.
 */
export function migrateLayerBlocks(
  loopBlocks: LoopBlock[],
  barRepeats: Record<number, BarRepeat>,
): { barRepeats: Record<number, BarRepeat>; loopBlocks: LoopBlock[] } {
  const layerBlocks = loopBlocks.filter(b => b.layerOf !== undefined);
  if (layerBlocks.length === 0) return { barRepeats, loopBlocks };

  const nextRepeats: Record<number, BarRepeat> = { ...barRepeats };
  for (const lb of layerBlocks) {
    for (let beat = lb.startBeat; beat <= lb.endBeat; beat++) {
      const existing = nextRepeats[beat] ?? ({ type: "count", value: 1 } as BarRepeat);
      const layer: NonNullable<BarRepeat["layers"]>[number] = {
        beatType: (lb.ownBeatTypes?.[beat] ?? "normal") as BeatType,
        subdivisions: lb.ownSubdivisions?.[String(beat)] as BeatType[] | undefined,
        ...(lb.soundSet ? { soundSet: lb.soundSet as SoundSet } : {}),
      };
      const existingLayers = existing.layers ?? [];
      nextRepeats[beat] = { ...existing, layers: [...existingLayers, layer] };
    }
  }
  const nextBlocks = loopBlocks.filter(b => b.layerOf === undefined);
  return { barRepeats: nextRepeats, loopBlocks: nextBlocks };
}

export function applyEntryToState(entry: PracticeEntry): AppliedEntryState {
  const rawBlocks = entry.loopBlocks ?? [];
  const rawRepeats = { ...(entry.barRepeats || {}) } as Record<number, BarRepeat>;
  const { barRepeats: migratedRepeats, loopBlocks: blocks } = migrateLayerBlocks(rawBlocks, rawRepeats);
  // BPM 오버라이드 정책: 양수만 통과. applyEntryToEngine과 동일하게 0/음수/누락은
  // "오버라이드 없음"으로 간주해 두 헬퍼가 같은 의미를 갖도록 잠근다.
  const bpmOverrides: Record<number, number> = {};
  for (const [k, v] of Object.entries(migratedRepeats)) {
    if (typeof v.bpm === "number" && v.bpm > 0) bpmOverrides[Number(k)] = v.bpm;
  }
  return {
    bpm: entry.bpm,
    beatsPerMeasure: entry.beatsPerMeasure,
    beatTypes: [...entry.beatTypes],
    beatSubdivisions: { ...entry.beatSubdivisions },
    barRepeats: migratedRepeats,
    loopBlocks: [...blocks],
    barLoopMode: entry.barLoopMode || "once",
    blockPlayMode: entry.blockPlayMode || "loop",
    subdivisionPattern: entry.subdivisionPattern ? [...entry.subdivisionPattern] : null,
    noteSamples: { ...(entry.noteSamples || {}) } as NoteSampleMap,
    noteSampleNames: { ...(entry.noteSampleNames || {}) } as NoteSampleNameMap,
    noteSampleSources: { ...(entry.noteSampleSources || {}) } as NoteSampleSourceMap,
    noteSampleChannels: { ...(entry.noteSampleChannels || {}) } as NoteSampleChannelMap,
    bpmOverrides,
  };
}

/**
 * Pure projection of a PracticeEntry into the BarConfig shape held in barConfigRef.
 * Centralizes default values for blockPlayMode/barClockMode/barTimerDuration so
 * apply (write) and selectCurrentBarConfig (read) stay in lockstep and can be
 * verified via roundtrip tests.
 *
 * Notes:
 * - barLoopMode is forced to "once" to match legacy applyEntryToEngine behavior;
 *   the entry's own barLoopMode is dropped intentionally (kept for parity).
 * - Maps are shallow-cloned so callers can mutate without affecting the entry.
 */
export function entryToBarConfig(entry: PracticeEntry): BarConfig {
  const rawBlocks = entry.loopBlocks ?? [];
  const rawRepeats = { ...(entry.barRepeats || {}) } as Record<number, BarRepeat>;
  const { barRepeats: migratedRepeats, loopBlocks: blocks } = migrateLayerBlocks(rawBlocks, rawRepeats);
  return {
    beatsPerMeasure: entry.beatsPerMeasure,
    beatTypes: [...entry.beatTypes],
    beatSubdivisions: { ...entry.beatSubdivisions },
    barRepeats: migratedRepeats,
    loopBlocks: [...blocks],
    barClockMode: entry.barClockMode || "stopwatch",
    barTimerDuration: entry.barTimerDuration ?? 180,
    noteSamples: { ...(entry.noteSamples || {}) } as NoteSampleMap,
    noteSampleNames: { ...(entry.noteSampleNames || {}) } as NoteSampleNameMap,
    noteSampleSources: { ...(entry.noteSampleSources || {}) } as NoteSampleSourceMap,
    noteSampleChannels: { ...(entry.noteSampleChannels || {}) } as NoteSampleChannelMap,
    barLoopMode: "once",
    blockPlayMode: entry.blockPlayMode || "loop",
    hasBeenConfigured: true,
  };
}

/**
 * 엔진 setter 시퀀스 추출. 라이브 컴포넌트(`applyEntryToEngine`,
 * `noteStartPlayingEntry`)에서 똑같이 호출되던 8단 setter 호출을 한 곳에 모아
 * - 호출 순서가 바뀔 일이 없게 단일 source로 만들고
 * - fake 엔진 spy로 단위 테스트가 가능하도록 한다.
 *
 * 인자 `engine`은 `MetronomeEngine`의 사용 메서드만 추린 부분 인터페이스라
 * 테스트에서 spy 객체로 그대로 주입할 수 있다.
 *
 * 호출 순서·인자가 바뀌면 사용자가 연습 항목을 불러올 때 마지막에 적용된 값이
 * 이전 값을 덮어써서 화면과 실제 재생이 어긋나는 사고가 가능하므로, 이 헬퍼를
 * 단일 진입점으로 유지한다.
 */
export interface EntryEngineSetters {
  setBpm(bpm: number): void;
  setBeatsPerMeasure(beats: number): void;
  setBeatTypes(types: BeatType[]): void;
  setAllBeatSubdivisions(subs: Record<string, BeatType[]>): void;
  setLoopBlocks(blocks: LoopBlock[]): void;
  setBlockPlayMode(mode: BlockPlayMode): void;
  setAllBarRepeats(repeats: Record<number, BarRepeat>): void;
  setAllBarBpmOverrides(overrides: Record<number, number>): void;
}

export function applyEntryToEngine(engine: EntryEngineSetters, entry: PracticeEntry): void {
  const rawBlocks = entry.loopBlocks ?? [];
  const rawRepeats = { ...(entry.barRepeats || {}) } as Record<number, BarRepeat>;
  const { barRepeats: migratedRepeats, loopBlocks: blocks } = migrateLayerBlocks(rawBlocks, rawRepeats);
  engine.setBpm(entry.bpm);
  engine.setBeatsPerMeasure(entry.beatsPerMeasure);
  engine.setBeatTypes([...entry.beatTypes]);
  engine.setAllBeatSubdivisions({ ...entry.beatSubdivisions });
  engine.setLoopBlocks([...blocks] as LoopBlock[]);
  engine.setBlockPlayMode(entry.blockPlayMode || "loop");
  engine.setAllBarRepeats(migratedRepeats);
  // BPM 오버라이드는 양수만 추출. 0/음수/누락은 "오버라이드 없음"으로 간주
  // (이전 인라인 코드의 truthy 체크와 동일 의도). 엔진은 20~300으로 클램프하므로
  // 0을 흘려보내면 20으로 잘못 강제될 수 있어, 이 경계는 헬퍼에서 막는다.
  const bpmOverrides: Record<number, number> = {};
  for (const [k, v] of Object.entries(migratedRepeats)) {
    if (typeof v.bpm === "number" && v.bpm > 0) bpmOverrides[Number(k)] = v.bpm;
  }
  engine.setAllBarBpmOverrides(bpmOverrides);
}

/**
 * handleLoopBlocksChange의 순수 로직 (엔진 갱신 + barConfig 갱신 + scheduleReRender).
 * app/index.tsx의 useCallback이 이 함수를 호출해 실제 동작을 위임한다.
 * React 상태 setter(setLoopBlocks)는 호출자가 별도로 수행한다.
 *
 * @param engine setLoopBlocks를 갖는 엔진 인터페이스 (null이면 스킵)
 * @param barConfig barConfigRef.current — loopBlocks 필드가 갱신된다
 * @param scheduleReRender WAV 버퍼 재구성을 예약하는 콜백
 * @param blocks 새 루프 블록 배열
 */
export interface LoopBlocksTarget {
  setLoopBlocks(blocks: LoopBlock[]): void;
}

export function applyLoopBlocksChange(
  engine: LoopBlocksTarget | null,
  barConfig: { loopBlocks: LoopBlock[] },
  scheduleReRender: () => void,
  blocks: LoopBlock[],
): void {
  engine?.setLoopBlocks(blocks);
  barConfig.loopBlocks = [...blocks];
  scheduleReRender();
}

export function createInitialBarConfig(beats = 4): BarConfig {
  return {
    beatsPerMeasure: beats,
    beatTypes: defaultBeatTypes(beats),
    beatSubdivisions: {},
    barRepeats: {},
    loopBlocks: [],
    barClockMode: "stopwatch",
    barTimerDuration: 180,
    noteSamples: {},
    noteSampleNames: {},
    noteSampleSources: {},
    noteSampleChannels: {},
    barLoopMode: "once",
    blockPlayMode: "loop",
    hasBeenConfigured: false,
  };
}
