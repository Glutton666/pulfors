export interface FilterOptions {
  minConfidence: number;
  minTranscriptLength: number;
  clickBlackoutMs: number;
}

export const DEFAULT_FILTER_OPTIONS: FilterOptions = {
  minConfidence: 0.5,
  minTranscriptLength: 2,
  clickBlackoutMs: 80,
};

export type FilterReason =
  | "ok"
  | "empty"
  | "too-short"
  | "low-confidence"
  | "click-blackout";

export interface FilterInput {
  transcript: string | undefined | null;
  confidence: number | undefined | null;
  now: number;
  lastClickAt: number | null;
}

export function shouldAcceptResult(
  input: FilterInput,
  options: FilterOptions = DEFAULT_FILTER_OPTIONS,
): FilterReason {
  const text = (input.transcript ?? "").trim();
  if (!text) return "empty";
  if (text.length < options.minTranscriptLength) return "too-short";
  // 일부 브라우저는 confidence를 0/undefined로 채워 보낸다. null/undefined는 통과시키되
  // 명시적 숫자가 임계 미만이면 거부.
  if (typeof input.confidence === "number" && Number.isFinite(input.confidence)) {
    if (input.confidence < options.minConfidence) return "low-confidence";
  }
  if (
    input.lastClickAt !== null &&
    input.now - input.lastClickAt >= 0 &&
    input.now - input.lastClickAt < options.clickBlackoutMs
  ) {
    return "click-blackout";
  }
  return "ok";
}

/** 메트로놈 클릭 시각을 추적해 직후 짧은 인식 결과를 차단하는 작은 상태 객체. */
export class ClickBlackout {
  private lastClickAt: number | null = null;
  constructor(private readonly windowMs: number = DEFAULT_FILTER_OPTIONS.clickBlackoutMs) {}
  noteClick(at: number = Date.now()): void {
    this.lastClickAt = at;
  }
  reset(): void {
    this.lastClickAt = null;
  }
  isInBlackout(now: number = Date.now()): boolean {
    if (this.lastClickAt === null) return false;
    const dt = now - this.lastClickAt;
    return dt >= 0 && dt < this.windowMs;
  }
  getLastClickAt(): number | null {
    return this.lastClickAt;
  }
}
