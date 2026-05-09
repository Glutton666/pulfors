/**
 * deep-link-import.ts
 *
 * 딥링크 / pending-import 경로로 수신된 외부 페이로드를
 * 안전한 PracticeEntry 로 변환하는 전용 sanitizer.
 *
 * 보안 원칙
 * - `...spread` 를 사용하지 않고, 알려진 필드를 명시적으로 허용 목록(allowlist) 처리.
 * - noteSamples / noteSampleNames / noteSampleSources 를 최상위 및
 *   모든 중첩 noteQueueEntries 에서 제거.
 *   이유: 송신 디바이스의 file:// URI 는 수신 측에서 무효이며,
 *         외부 http/https URI 는 아웃바운드 네트워크 요청을 유발한다.
 * - noteSampleChannels 는 URI 가 없는 메타데이터이므로 scheme 검증 후 허용.
 * - bpm, beatsPerMeasure 등 숫자 필드를 유효 범위로 클램프.
 * - bpm / beatTypes 가 누락된 페이로드는 null 반환.
 */

import { sanitizeNoteSampleChannelMap } from "./backup/shared";
import { logger } from "./logger";
import type { PracticeEntry } from "./storage";
import type { BeatType } from "./metronome-engine";

const MAX_LABEL_LEN = 200;
const MAX_QUEUE_ENTRIES = 500;
const MAX_QUEUE_IDS = 500;
/** noteQueueEntries 최대 재귀 깊이 (pathological 중첩 페이로드 방어) */
const MAX_DEPTH = 4;

/**
 * 외부에서 수신한 `raw` 페이로드를 검증하여 안전한 PracticeEntry 를 반환한다.
 * 검증 실패 시 null 을 반환한다.
 *
 * 호출자는 반환된 entry 의 `id` 와 `createdAt` 을 자신의 UUID / 타임스탬프로
 * 반드시 덮어씌워야 한다.
 */
export function sanitizeDeepLinkEntry(raw: unknown, _depth = 0): PracticeEntry | null {
  if (_depth >= MAX_DEPTH) {
    logger.warn(`[DeepLink] noteQueueEntries 재귀 깊이 초과 (${MAX_DEPTH}), 항목 무시`);
    return null;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const d = raw as Record<string, unknown>;

  if (typeof d.bpm !== "number" || !isFinite(d.bpm)) {
    logger.warn("[DeepLink] bpm 필드 누락 또는 비숫자 — 페이로드 거부");
    return null;
  }
  if (!Array.isArray(d.beatTypes)) {
    logger.warn("[DeepLink] beatTypes 필드 누락 — 페이로드 거부");
    return null;
  }

  const bpm = Math.max(20, Math.min(300, Math.round(d.bpm)));
  const beatsPerMeasure =
    typeof d.beatsPerMeasure === "number" && isFinite(d.beatsPerMeasure)
      ? Math.max(1, Math.min(16, Math.round(d.beatsPerMeasure)))
      : 4;

  const beatSubdivisions: Record<string, BeatType[]> =
    d.beatSubdivisions !== null &&
    typeof d.beatSubdivisions === "object" &&
    !Array.isArray(d.beatSubdivisions)
      ? (d.beatSubdivisions as Record<string, BeatType[]>)
      : {};

  const barRepeats: Record<number, unknown> =
    d.barRepeats !== null &&
    typeof d.barRepeats === "object" &&
    !Array.isArray(d.barRepeats)
      ? (d.barRepeats as Record<number, unknown>)
      : {};

  const barLoopMode: "loop" | "once" =
    d.barLoopMode === "once" ? "once" : "loop";

  const subdivisionPattern: BeatType[] = Array.isArray(d.subdivisionPattern)
    ? (d.subdivisionPattern as BeatType[])
    : [];

  const entry: PracticeEntry = {
    id: typeof d.id === "string" && d.id ? d.id : "",
    label:
      typeof d.label === "string"
        ? d.label.slice(0, MAX_LABEL_LEN)
        : "",
    createdAt:
      typeof d.createdAt === "number" && isFinite(d.createdAt)
        ? d.createdAt
        : Date.now(),
    bpm,
    beatsPerMeasure,
    beatTypes: d.beatTypes as BeatType[],
    beatSubdivisions,
    barRepeats: barRepeats as PracticeEntry["barRepeats"],
    barLoopMode,
    subdivisionPattern,
    noteSamples: {},
  };

  if (d.mode === "beat" || d.mode === "bar" || d.mode === "note") {
    entry.mode = d.mode;
  }
  if (
    d.blockPlayMode === "sequential" ||
    d.blockPlayMode === "loop" ||
    d.blockPlayMode === "random"
  ) {
    entry.blockPlayMode = d.blockPlayMode;
  }
  if (d.barClockMode === "stopwatch" || d.barClockMode === "timer") {
    entry.barClockMode = d.barClockMode;
  }
  if (
    typeof d.barTimerDuration === "number" &&
    isFinite(d.barTimerDuration) &&
    d.barTimerDuration >= 0
  ) {
    entry.barTimerDuration = Math.round(d.barTimerDuration);
  }
  if (Array.isArray(d.loopBlocks)) {
    entry.loopBlocks = d.loopBlocks as PracticeEntry["loopBlocks"];
  }
  if (
    d.notePlayMode === "once" ||
    d.notePlayMode === "loop" ||
    d.notePlayMode === "random"
  ) {
    entry.notePlayMode = d.notePlayMode;
  }

  if (
    d.noteSampleChannels !== null &&
    typeof d.noteSampleChannels === "object" &&
    !Array.isArray(d.noteSampleChannels)
  ) {
    entry.noteSampleChannels = sanitizeNoteSampleChannelMap(
      d.noteSampleChannels as Record<string, unknown>,
    );
  }

  if (Array.isArray(d.noteQueueEntryIds)) {
    entry.noteQueueEntryIds = (d.noteQueueEntryIds as unknown[])
      .filter((v): v is string => typeof v === "string")
      .slice(0, MAX_QUEUE_IDS);
  }

  if (Array.isArray(d.noteQueueEntries)) {
    entry.noteQueueEntries = (d.noteQueueEntries as unknown[])
      .slice(0, MAX_QUEUE_ENTRIES)
      .map((qe) => sanitizeDeepLinkEntry(qe, _depth + 1))
      .filter((qe): qe is PracticeEntry => qe !== null);
  }

  return entry;
}
