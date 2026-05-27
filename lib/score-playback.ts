// ============================================================
// 악보 재생 타임라인 계산 (순수 함수)
// ============================================================

import type { ScoreDocument, ScoreMeasure } from "./score-types";

// ── 재생 이벤트 ────────────────────────────────────────────────

export interface PlayEvent {
  /** 재생 순서 상 인덱스 (반복 포함) */
  seqIdx: number;
  /** 악보 내 실제 마디 인덱스 */
  measureIdx: number;
  /** 타임라인 시작부터의 절대 시간(ms) */
  startTimeMs: number;
  /** 이 마디의 재생 지속 시간(ms) */
  durationMs: number;
  /** 이 마디에 적용된 시작 BPM */
  effectiveBpm: number;
  /** rit./accel.로 도달할 목표 BPM (없으면 effectiveBpm과 동일) */
  endBpm: number;
}

// ── 반복 부호에 따른 재생 순서 계산 ──────────────────────────

/**
 * ScoreDocument의 반복 부호를 분석해 마디 인덱스 시퀀스를 반환한다.
 * (repeatStart/End, voltaBracket, segno, coda, jumpTo 처리)
 */
export function resolvePlayOrder(doc: ScoreDocument): number[] {
  const measures = doc.parts[0]?.measures ?? [];
  const n = measures.length;
  if (n === 0) return [];

  const order: number[] = [];
  const MAX_TOTAL = n * 10; // 무한루프 방지

  let i = 0;
  let repeatStartIdx = 0;
  let repeatPassCount = 0; // 현재 반복구간 통과 횟수 (0-based)
  const MAX_REPEAT_PASSES = 2;

  let segnoIdx = -1;
  let codaIdx = -1;
  let jumped = false; // D.C./D.S. 점프는 최대 1회

  while (i < n && order.length < MAX_TOTAL) {
    const m = measures[i];

    // segno/coda 위치 기록
    if (m.segno && segnoIdx < 0) segnoIdx = i;
    if (m.coda && codaIdx < 0) codaIdx = i;

    // repeatStart
    if (m.repeatStart) {
      repeatStartIdx = i;
      repeatPassCount = 0;
    }

    order.push(i);

    // voltaBracket: 첫 번째 괄호(1)는 첫 번쨰 패스에만, 두 번째(2)는 마지막 패스에만
    const volta = m.voltaBracket;
    if (volta === 1 && repeatPassCount > 0) {
      // 2회차 이후에는 1번 괄호 마디를 건너뜀 — 이미 push 했으므로 제거
      order.pop();
    }

    // repeatEnd
    if (m.repeatEnd) {
      if (repeatPassCount < MAX_REPEAT_PASSES - 1) {
        repeatPassCount++;
        i = repeatStartIdx;
        continue;
      } else {
        repeatPassCount = 0;
      }
    }

    // jumpTo (D.C., D.S., Fine, Coda)
    if (m.jumpTo && !jumped) {
      jumped = true;
      if (m.jumpTo === "fine") {
        break;
      } else if (m.jumpTo === "start") {
        i = 0;
        continue;
      } else if (m.jumpTo === "segno" && segnoIdx >= 0) {
        i = segnoIdx;
        continue;
      } else if (m.jumpTo === "coda" && codaIdx >= 0) {
        i = codaIdx;
        continue;
      }
    }

    i++;
  }

  return order;
}

// ── 마디 하나의 재생 시간 계산 ────────────────────────────────

/**
 * 단일 마디의 재생 지속 시간(ms)을 계산한다.
 * bpm이 없으면 prevBpm을 사용한다.
 */
export function measureDurationMs(
  measure: ScoreMeasure,
  docTimeSignature: { numerator: number; denominator: number },
  prevBpm: number,
): { durationMs: number; startBpm: number; endBpm: number } {
  const num = measure.timeSignature?.numerator ?? docTimeSignature.numerator;
  const den = measure.timeSignature?.denominator ?? docTimeSignature.denominator;
  const startBpm = (measure.bpm && measure.bpm > 0) ? measure.bpm : Math.max(1, prevBpm);

  // den=4 → 4분음표 기준. 분자(num)개의 4분음표 단위.
  const safeDen = den > 0 ? den : 4;
  const beatFactor = 4 / safeDen; // ex: den=8 → 0.5
  const totalBeats = Math.max(0.25, num * beatFactor);

  let endBpm = startBpm;
  let durationMs: number;

  if (
    (measure.tempoChangeType === "rit" || measure.tempoChangeType === "accel") &&
    measure.tempoEndBpm && measure.tempoEndBpm > 0
  ) {
    endBpm = measure.tempoEndBpm;
    // 선형 보간: 평균 BPM으로 근사
    const avgBpm = (startBpm + endBpm) / 2;
    durationMs = totalBeats * (60000 / avgBpm);
  } else {
    durationMs = totalBeats * (60000 / startBpm);
  }

  return { durationMs, startBpm, endBpm };
}

// ── 전체 타임라인 빌드 ────────────────────────────────────────

/**
 * ScoreDocument → PlayEvent[] 타임라인 빌드
 * 반복 부호, 인라인 BPM 변화, rit./accel.을 처리한다.
 */
export function buildPlayTimeline(doc: ScoreDocument): PlayEvent[] {
  const order = resolvePlayOrder(doc);
  const measures = doc.parts[0]?.measures ?? [];
  if (measures.length === 0 || order.length === 0) return [];

  const events: PlayEvent[] = [];
  let currentBpm = doc.bpm > 0 ? doc.bpm : 120;
  let t = 0;

  for (let seq = 0; seq < order.length; seq++) {
    const mIdx = order[seq];
    const measure = measures[mIdx];
    if (!measure) continue;

    const { durationMs, startBpm, endBpm } = measureDurationMs(
      measure,
      doc.timeSignature,
      currentBpm,
    );

    events.push({
      seqIdx: seq,
      measureIdx: mIdx,
      startTimeMs: t,
      durationMs,
      effectiveBpm: startBpm,
      endBpm,
    });

    t += durationMs;
    currentBpm = endBpm;
  }

  return events;
}

// ── 현재 위치 검색 ────────────────────────────────────────────

/**
 * 재생 경과 시간(ms)에서 현재 PlayEvent와 마디 내 위치(0-1)를 반환한다.
 */
export function findCurrentEvent(
  timeline: PlayEvent[],
  elapsedMs: number,
): { event: PlayEvent | null; fraction: number } {
  if (timeline.length === 0) return { event: null, fraction: 0 };

  for (let i = 0; i < timeline.length; i++) {
    const ev = timeline[i];
    if (elapsedMs >= ev.startTimeMs && elapsedMs < ev.startTimeMs + ev.durationMs) {
      const fraction = (elapsedMs - ev.startTimeMs) / ev.durationMs;
      return { event: ev, fraction };
    }
  }

  // 마지막 이후
  const last = timeline[timeline.length - 1];
  return { event: last, fraction: 1 };
}

/** 타임라인 전체 지속 시간(ms) */
export function totalTimelineMs(timeline: PlayEvent[]): number {
  if (timeline.length === 0) return 0;
  const last = timeline[timeline.length - 1];
  return last.startTimeMs + last.durationMs;
}
