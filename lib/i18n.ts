// ============================================================
// i18n.ts — 언어 감지·t() 함수·누락 보고 등 런타임 로직
// 번역 데이터는 i18n.data.ts에 있습니다.
// 기존 `import { ... } from "@/lib/i18n"` 경로는 그대로 유지됩니다.
// ============================================================

// 데이터 모듈의 모든 export를 re-export — 기존 import 경로 호환
export {
  SUPPORTED_LANGUAGES,
  FALLBACK_LANGUAGE,
  LANGUAGE_LABELS,
  LANGUAGE_OPTIONS,
  translations,
} from "./i18n.data";
export type {
  LanguageCode,
  Language,
  TranslationLeaf,
  BarModeViewKey,
  KbSectionKey,
  TranslationFn,
} from "./i18n.data";

import {
  SUPPORTED_LANGUAGES,
  FALLBACK_LANGUAGE,
  type LanguageCode,
  type Language,
  type TranslationLeaf,
  type TranslationFn,
  translations,
} from "./i18n.data";

export function isLanguageCode(v: unknown): v is LanguageCode {
  return typeof v === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(v);
}

// 디바이스 로케일을 SUPPORTED_LANGUAGES에 매핑한다. 일치하는 코드가 없으면
// FALLBACK_LANGUAGE를 반환한다. RN/web/노드 모두에서 안전하게 동작하도록
// 여러 소스를 순차 확인한다.
export function detectDeviceLanguage(): LanguageCode {
  const candidates: string[] = [];
  try {
    const g = globalThis as {
      navigator?: { language?: string; languages?: readonly string[] };
      Intl?: { DateTimeFormat?: () => { resolvedOptions: () => { locale?: string } } };
    };
    if (g.navigator?.languages) candidates.push(...g.navigator.languages);
    if (g.navigator?.language) candidates.push(g.navigator.language);
    const intl = g.Intl?.DateTimeFormat?.();
    const intlLocale = intl?.resolvedOptions?.().locale;
    if (intlLocale) candidates.push(intlLocale);
  } catch {
    // 환경 의존 — 무시하고 폴백
  }
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const primary = raw.toLowerCase().split(/[-_]/)[0];
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(primary)) {
      return primary as LanguageCode;
    }
  }
  return FALLBACK_LANGUAGE;
}

const warnedMissing = new Set<string>();

function isDevEnv(): boolean {
  try {
    return typeof (globalThis as { __DEV__?: unknown }).__DEV__ !== "undefined"
      ? Boolean((globalThis as { __DEV__?: unknown }).__DEV__)
      : process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}

function reportMissing(section: string, key: string): void {
  if (!isDevEnv()) return;
  const id = `${section}.${key}`;
  if (warnedMissing.has(id)) return;
  warnedMissing.add(id);
  console.warn(`[i18n] missing translation: ${id}`);
  void import("./error-tracking").then((m) => {
    try {
      m.captureBreadcrumb({ category: "i18n", message: `missing ${id}`, level: "warning" });
    } catch {}
  }).catch(() => {});
}

export function createT(lang: Language): TranslationFn {
  return ((section: string, key: string) => {
    const s = (translations as Record<string, Record<string, TranslationLeaf> | undefined>)[section];
    if (!s) {
      reportMissing(section, key);
      return key;
    }
    const entry = s[key];
    if (!entry) {
      reportMissing(section, key);
      return key;
    }
    // 폴백 체인: 선택 언어 → FALLBACK_LANGUAGE → 키 자체.
    // 선택 언어 값이 비어있으면 dev 모드에서 한 번 경고한다.
    const selected = entry[lang as LanguageCode];
    if (selected) return selected;
    const fallback = entry[FALLBACK_LANGUAGE];
    if (fallback) {
      reportMissing(`${section}.${key}@${lang}`, "fallback->" + FALLBACK_LANGUAGE);
      return fallback;
    }
    reportMissing(section, key);
    return key;
  }) as TranslationFn;
}

export function getTempoLabel(bpm: number, lang: Language): string {
  const t = createT(lang);
  if (bpm < 40) return t("tempoLabels", "grave");
  if (bpm < 60) return t("tempoLabels", "largo");
  if (bpm < 80) return t("tempoLabels", "adagio");
  if (bpm < 100) return t("tempoLabels", "andante");
  if (bpm < 120) return t("tempoLabels", "moderato");
  if (bpm < 160) return t("tempoLabels", "allegro");
  if (bpm < 200) return t("tempoLabels", "vivace");
  if (bpm < 300) return t("tempoLabels", "presto");
  return t("tempoLabels", "prestissimo");
}

export function formatDurationLocalized(seconds: number, lang: Language): string {
  const t = createT(lang);
  if (seconds < 60) return `${Math.round(seconds)}${t("duration", "s")}`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return secs > 0 ? `${mins}${t("duration", "m")} ${secs}${t("duration", "s")}` : `${mins}${t("duration", "m")}`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}${t("duration", "h")} ${remainMins}${t("duration", "m")}` : `${hrs}${t("duration", "h")}`;
}
