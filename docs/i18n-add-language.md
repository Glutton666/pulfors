# 새 언어 추가 가이드 (샘플 PR 시나리오)

이 문서는 Pulpor 메트로놈에 새 언어를 추가할 때 따라야 할 최소 변경 절차를 보여줍니다. 예시로 일본어(`ja`)를 추가합니다.

## 변경 파일 (1 PR로 묶을 수 있는 최소 단위)

1. **`lib/i18n.ts`** — `SUPPORTED_LANGUAGES`에 코드 한 줄 추가
   ```ts
   export const SUPPORTED_LANGUAGES = ["ko", "en", "ja"] as const;
   ```
   이 시점에서 `tsc --noEmit`이 모든 `translations` leaf에서 `ja` 키 누락을 한 번에 보고합니다.

2. **`lib/i18n.ts`** — 보고된 leaf마다 `ja` 문자열을 채웁니다.
   ```ts
   title: { ko: "설정", en: "Settings", ja: "設定" },
   ```
   - 빈 문자열은 `tests/i18n-completeness.test.ts`가 잡습니다.
   - 키 셋 동치성은 `tests/i18n-meta.test.ts`가 보장합니다.

## 자동으로 처리되는 부분 (별도 코드 변경 불필요)

- **저장된 언어 코드 검증**: `contexts/LanguageContext.tsx`는 `isLanguageCode`를 사용하므로 새 코드를 자동으로 받아들입니다.
- **폴백 체인**: 선택 언어 값이 비어 있으면 `FALLBACK_LANGUAGE`(현재 `en`) → 키 문자열 순으로 폴백합니다. 폴백 발생 시 dev 모드에서 `console.warn` + Sentry breadcrumb로 한 번만 보고합니다.
- **정적 호출 검사**: `npx tsx scripts/check-i18n-keys.ts`가 코드의 `t("ns","key")` 호출을 검증합니다.

## 회귀 가드 명령어

```bash
npx tsc --noEmit
npx tsx --require ./tests/_stubs/setup.cjs --test tests/i18n-meta.test.ts tests/i18n-completeness.test.ts tests/i18n.test.ts
npx tsx scripts/check-i18n-keys.ts
```

## 범위 외

- 디바이스 로케일 자동 매핑(예: `ja-JP` → `ja`)은 현재 사용자 수동 선택만 지원합니다. 추가 매핑이 필요하면 `LanguageContext`의 초기 로드 분기를 확장하세요.
- i18next 같은 라이브러리 도입은 본 구조의 범위 밖입니다.
