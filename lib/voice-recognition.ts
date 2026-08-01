import { Platform } from "react-native";

export interface RecognitionResult {
  transcript: string;
  isFinal: boolean;
  confidence: number;
}

export type RecognitionEvent =
  | { type: "result"; result: RecognitionResult }
  | { type: "error"; error: string }
  | { type: "end" }
  | { type: "start" };

export type RecognitionListener = (event: RecognitionEvent) => void;

/**
 * Returns true if in-app speech recognition is available on this platform.
 * - web:     checked at runtime via SpeechRecognition / webkitSpeechRecognition
 * - android: always true (uses a hidden WebView + Chrome Web Speech API)
 * - ios:     false — Web Speech API unavailable in WKWebView; use Siri shortcuts instead
 */
export function isVoiceRecognitionSupported(): boolean {
  if (Platform.OS === "web") {
    const g = globalThis as Record<string, unknown>;
    return !!(g["SpeechRecognition"] || g["webkitSpeechRecognition"]);
  }
  if (Platform.OS === "android") return true;
  return false;
}

/**
 * Create a Web Speech API recognition handle (browser / web platform only).
 * Throws if SpeechRecognition is not available.
 */
export function createWebRecognition(
  lang: string,
  onEvent: RecognitionListener,
  minConfidence = 0.0,
): { start: () => void; stop: () => void; abort: () => void } {
  const g = globalThis as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SR = (g["SpeechRecognition"] ?? g["webkitSpeechRecognition"]) as (new () => any) | undefined;
  if (!SR) throw new Error("SpeechRecognition not available in this browser");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rec: any = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = lang;

  rec.onstart = () => onEvent({ type: "start" });
  rec.onend = () => onEvent({ type: "end" });
  rec.onerror = (e: { error?: string }) =>
    onEvent({ type: "error", error: e?.error ?? "unknown" });
  rec.onresult = (e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string; confidence: number } }>; resultIndex: number }) => {
    const result = e.results[e.resultIndex];
    if (!result) return;
    const alt = result[0];
    if (!alt) return;
    const confidence = (alt.confidence as number | undefined) ?? 1;
    if (result.isFinal && confidence < minConfidence) return;
    onEvent({
      type: "result",
      result: { transcript: alt.transcript, isFinal: result.isFinal, confidence },
    });
  };

  let started = false;
  return {
    start() {
      if (started) return;
      started = true;
      try { rec.start(); } catch { /* already started */ }
    },
    stop() {
      started = false;
      try { rec.stop(); } catch {}
    },
    abort() {
      started = false;
      try { rec.abort(); } catch {}
    },
  };
}
