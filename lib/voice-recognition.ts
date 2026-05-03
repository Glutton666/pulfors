import { Platform } from "react-native";
import { ClickBlackout, DEFAULT_FILTER_OPTIONS, shouldAcceptResult, type FilterReason } from "./voice-filter";

export interface RecognitionStartOptions {
  lang: "ko" | "en";
  onResult: (text: string) => void;
  onError: (err: string) => void;
  onEnd: () => void;
  /** 인식 결과 신뢰도 임계 (브라우저가 confidence를 제공할 때만 적용). 기본 0.5 */
  minConfidence?: number;
  /** trim 후 최소 길이. 단일 음절 오인을 차단. 기본 2 */
  minTranscriptLength?: number;
  /** 메트로놈 클릭 직후 인식 결과를 무시하는 윈도우(ms). 기본 80 */
  clickBlackoutMs?: number;
  /** 결과가 필터링되었을 때 알림(테스트/로깅용). */
  onResultFiltered?: (reason: FilterReason, transcript: string) => void;
}

export interface RecognitionHandle {
  stop: () => void;
  /** 메트로놈이 클릭을 낼 때마다 호출하면 직후 인식 결과가 차단된다. */
  noteClick: (at?: number) => void;
}

export function isVoiceRecognitionSupported(): boolean {
  if (Platform.OS !== "web") return false;
  if (typeof window === "undefined") return false;
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return !!SR;
}

export function startVoiceRecognition(opts: RecognitionStartOptions): RecognitionHandle | null {
  if (!isVoiceRecognitionSupported()) {
    opts.onError("not-supported");
    return null;
  }
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  let rec: any;
  try {
    rec = new SR();
  } catch (e) {
    opts.onError(String(e));
    return null;
  }
  rec.lang = opts.lang === "ko" ? "ko-KR" : "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 3;
  rec.continuous = false;

  const filterOptions = {
    minConfidence: opts.minConfidence ?? DEFAULT_FILTER_OPTIONS.minConfidence,
    minTranscriptLength: opts.minTranscriptLength ?? DEFAULT_FILTER_OPTIONS.minTranscriptLength,
    clickBlackoutMs: opts.clickBlackoutMs ?? DEFAULT_FILTER_OPTIONS.clickBlackoutMs,
  };
  const blackout = new ClickBlackout(filterOptions.clickBlackoutMs);

  rec.onresult = (e: any) => {
    try {
      const results = e.results?.[0];
      if (!results) return;
      const first = results[0];
      const transcript: string | undefined = first?.transcript;
      const confidence: number | undefined = typeof first?.confidence === "number" ? first.confidence : undefined;
      const reason = shouldAcceptResult(
        {
          transcript,
          confidence,
          now: Date.now(),
          lastClickAt: blackout.getLastClickAt(),
        },
        filterOptions,
      );
      if (reason !== "ok") {
        opts.onResultFiltered?.(reason, transcript ?? "");
        return;
      }
      // 첫 결과만 전달 (모든 alt를 join으로 보내면 중복 매칭 발생 가능)
      opts.onResult(transcript!);
    } catch (err) {
      opts.onError(String(err));
    }
  };
  rec.onerror = (e: any) => {
    opts.onError(String(e?.error || "unknown"));
  };
  rec.onend = () => {
    opts.onEnd();
  };

  try {
    rec.start();
  } catch (e) {
    opts.onError(String(e));
    return null;
  }

  return {
    stop: () => {
      try { rec.stop(); } catch {}
    },
    noteClick: (at?: number) => {
      blackout.noteClick(at ?? Date.now());
    },
  };
}
