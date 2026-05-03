import { Platform } from "react-native";

export interface RecognitionStartOptions {
  lang: "ko" | "en";
  onResult: (text: string) => void;
  onError: (err: string) => void;
  onEnd: () => void;
}

export interface RecognitionHandle {
  stop: () => void;
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

  let resolved = false;
  rec.onresult = (e: any) => {
    try {
      const results = e.results?.[0];
      if (!results) return;
      const transcripts: string[] = [];
      for (let i = 0; i < results.length; i++) {
        const t = results[i]?.transcript;
        if (t) transcripts.push(t);
      }
      if (transcripts.length > 0) {
        resolved = true;
        // 첫 결과만 전달 (모든 alt를 join으로 보내면 중복 매칭 발생 가능)
        opts.onResult(transcripts[0]);
      }
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
  };
}
