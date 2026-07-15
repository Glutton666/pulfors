export type VoiceCommand =
  | { type: "play" }
  | { type: "stop" }
  | { type: "toggle" }
  | { type: "setBpm"; bpm: number }
  | { type: "bpmDelta"; delta: number }
  | { type: "bpmMultiplier"; factor: number }
  | { type: "setBeats"; beats: number }
  | { type: "reset" }
  | { type: "help" }
  | { type: "unknown"; reason?: "noNickname" | "empty" | "noMatch" };

export interface ParseOptions {
  nickname?: string;
  strictNickname?: boolean;
}

const KO_COMPOUND: Record<string, number> = {
  "삼백": 300, "이백구십": 290, "이백팔십": 280, "이백칠십": 270, "이백육십": 260,
  "이백오십": 250, "이백사십": 240, "이백삼십": 230, "이백이십": 220, "이백십": 210, "이백": 200,
  "백구십": 190, "백팔십": 180, "백칠십": 170, "백육십": 160, "백오십": 150,
  "백사십": 140, "백삼십": 130, "백이십": 120, "백십": 110, "백": 100,
  "구십": 90, "팔십": 80, "칠십": 70, "육십": 60, "오십": 50, "사십": 40, "삼십": 30, "이십": 20,
};

const EN_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

function parseEnglishWordNumber(text: string): number | null {
  const words = text.toLowerCase().split(/\s+/);
  let total = 0;
  let cur = 0;
  let matched = false;
  for (const w of words) {
    if (w in EN_NUMBERS) {
      matched = true;
      const n = EN_NUMBERS[w];
      if (n === 100) cur = (cur || 1) * 100;
      else cur += n;
    } else if (w === "and") {
      // skip
    } else {
      if (cur) { total += cur; cur = 0; }
    }
  }
  total += cur;
  return matched ? total : null;
}

function parseKoreanWordNumber(text: string): number | null {
  for (const [k, v] of Object.entries(KO_COMPOUND)) {
    if (text.includes(k)) return v;
  }
  return null;
}

function parseAnyNumber(text: string): number | null {
  const digit = text.match(/(\d{1,3})/);
  if (digit) return parseInt(digit[1], 10);
  const ko = parseKoreanWordNumber(text);
  if (ko !== null) return ko;
  const en = parseEnglishWordNumber(text);
  if (en !== null && en > 0) return en;
  return null;
}

function stripNickname(text: string, nickname: string): string {
  const nick = nickname.trim().toLowerCase();
  if (!nick) return text;
  // 애칭 + 호격조사("아"/"야"/"") 제거
  return text.replace(new RegExp(`${nick}[아야]?\\s*`, "gi"), "").trim();
}

export function parseVoiceCommand(rawInput: string, opts: ParseOptions = {}): VoiceCommand {
  const original = (rawInput || "").trim().toLowerCase();
  if (!original) return { type: "unknown", reason: "empty" };

  const nick = (opts.nickname || "").trim().toLowerCase();
  if (opts.strictNickname && nick) {
    if (!original.includes(nick)) return { type: "unknown", reason: "noNickname" };
  }

  const text = nick ? stripNickname(original, nick) : original;

  if (/초기화|리셋|reset|restart/i.test(text)) return { type: "reset" };
  if (/도움말|명령어|help|commands?/i.test(text)) return { type: "help" };

  // 박자: "3박자", "4박", "6 beats", "4분의 3"
  const koBeats = text.match(/(\d{1,2})\s*(?:박자|박)/);
  if (koBeats) {
    const n = parseInt(koBeats[1], 10);
    if (n >= 1 && n <= 16) return { type: "setBeats", beats: n };
  }
  const enBeats = text.match(/(\d{1,2})\s*(?:beats?|time|over)/);
  if (enBeats) {
    const n = parseInt(enBeats[1], 10);
    if (n >= 1 && n <= 16) return { type: "setBeats", beats: n };
  }
  const koDivision = text.match(/4분의\s*(\d{1,2})/);
  if (koDivision) {
    const n = parseInt(koDivision[1], 10);
    if (n >= 1 && n <= 16) return { type: "setBeats", beats: n };
  }

  // BPM 배수
  if (/두\s*배|2배|두배|double|twice/.test(text)) return { type: "bpmMultiplier", factor: 2 };
  if (/절반|반\s*속|반속도|half/.test(text)) return { type: "bpmMultiplier", factor: 0.5 };

  // BPM 델타 (큰 변화 먼저)
  if (/많이\s*빠르|훨씬\s*빠르|much\s*faster|a\s*lot\s*faster|way\s*faster/.test(text)) return { type: "bpmDelta", delta: 10 };
  if (/많이\s*느리|훨씬\s*느리|much\s*slower|a\s*lot\s*slower|way\s*slower/.test(text)) return { type: "bpmDelta", delta: -10 };
  if (/빠르게|빨리|faster|speed\s*up/.test(text)) return { type: "bpmDelta", delta: 5 };
  if (/느리게|천천히|느리|slower|slow\s*down/.test(text)) return { type: "bpmDelta", delta: -5 };

  // 명시적 BPM 설정
  const explicit = text.match(/(?:bpm|tempo|템포|비피엠)\s*(\d{2,3})|(\d{2,3})\s*(?:bpm|tempo|템포|비피엠)/);
  if (explicit) {
    const n = parseInt(explicit[1] || explicit[2], 10);
    if (n >= 20 && n <= 300) return { type: "setBpm", bpm: n };
  }
  const koSet = text.match(/(\d{2,3})\s*(?:으로|로)/);
  if (koSet) {
    const n = parseInt(koSet[1], 10);
    if (n >= 20 && n <= 300) return { type: "setBpm", bpm: n };
  }
  const enSet = text.match(/(?:set|change|to)\s+(?:to\s+)?(\d{2,3})/);
  if (enSet) {
    const n = parseInt(enSet[1], 10);
    if (n >= 20 && n <= 300) return { type: "setBpm", bpm: n };
  }

  // 토글
  if (/토글|toggle/.test(text)) return { type: "toggle" };

  // 재생/정지 (박자 동사 충돌 방지: "stop" 먼저 검사)
  if (/정지|멈춰|멈춤|스톱|중지|stop|pause|halt|end/.test(text)) return { type: "stop" };
  if (/재생|시작|출발|플레이|play|start|begin|^go$|\sgo\s|\sgo$/.test(text)) return { type: "play" };

  // 한국어 숫자만 발화 ("백이십" / "백" 등) → BPM 설정
  const ko = parseKoreanWordNumber(text);
  if (ko !== null && ko >= 20 && ko <= 300) return { type: "setBpm", bpm: ko };

  // 영어 숫자 워드만 → BPM
  const en = parseEnglishWordNumber(text);
  if (en !== null && en >= 20 && en <= 300) return { type: "setBpm", bpm: en };

  // 숫자만 발화 → BPM
  const bare = parseAnyNumber(text);
  if (bare !== null && bare >= 20 && bare <= 300) return { type: "setBpm", bpm: bare };

  return { type: "unknown", reason: "noMatch" };
}
