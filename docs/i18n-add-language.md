# 새 언어 추가 가이드 (샘플 PR 시나리오)

이 문서는 Pulpor 메트로놈에 새 언어를 추가할 때 따라야 할 최소 변경 절차를 보여줍니다. 예시로 일본어(`ja`)를 추가합니다.

## 변경 파일 (1 PR로 묶을 수 있는 최소 단위)

1. **`lib/i18n.ts`** — `SUPPORTED_LANGUAGES`에 코드 한 줄 추가
   ```ts
   export const SUPPORTED_LANGUAGES = ["ko", "en", "ja"] as const;
   ```
   이 시점에서 `tsc --noEmit`이 모든 `translations` leaf와 `LANGUAGE_LABELS`에서 `ja` 키 누락을 한 번에 보고합니다.

2. **`lib/i18n.ts`** — `LANGUAGE_LABELS`에 표시 라벨을 추가합니다.
   ```ts
   export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
     ko: "한국어",
     en: "English",
     ja: "日本語",
   };
   ```
   `LANGUAGE_OPTIONS`는 자동으로 갱신되어 Settings/Onboarding 화면 옵션에 그대로 노출됩니다.

3. **`lib/i18n.ts`** — 보고된 leaf마다 `ja` 문자열을 채웁니다.
   ```ts
   title: { ko: "설정", en: "Settings", ja: "設定" },
   ```
   - 빈 문자열은 `tests/i18n-completeness.test.ts`가 잡습니다(SUPPORTED_LANGUAGES 순회).
   - 키 셋 동치성은 `tests/i18n-meta.test.ts`가 보장합니다.
   - 컴파일 타임 가드는 `tests/fixtures/i18n-compile-fixture.ts`가 `@ts-expect-error`로 증명합니다.

## 자동으로 처리되는 부분 (별도 코드 변경 불필요)

- **디바이스 로케일 자동 감지**: `LanguageContext`는 첫 실행 시 `detectDeviceLanguage()`로 시작합니다. 우선순위는 `navigator.languages` → `navigator.language` → `Intl.DateTimeFormat().resolvedOptions().locale` 순이며, 1차 서브태그(`ko-KR` → `ko`)를 SUPPORTED_LANGUAGES에 매칭하고 일치하는 코드가 없으면 `FALLBACK_LANGUAGE`로 떨어집니다.
- **수동 선택 유지**: 사용자가 Settings/Onboarding에서 선택한 값은 AsyncStorage에 저장되며, `isLanguageCode`로 검증되어 새 코드도 추가 분기 없이 자동 인정됩니다.
- **UI 옵션**: `SettingsModal`/`OnboardingModal`은 하드코딩된 ko/en 배열 대신 `LANGUAGE_OPTIONS`를 직접 렌더링합니다.
- **폴백 체인**: 선택 언어 값이 비어 있으면 `FALLBACK_LANGUAGE`(현재 `en`) → 키 문자열 순으로 폴백합니다. 폴백 발생 시 dev 모드에서 `console.warn` + Sentry breadcrumb로 한 번만 보고합니다.
- **정적 호출 검사**: `npx tsx scripts/check-i18n-keys.ts`가 코드의 `t("ns","key")` 호출을 검증합니다.

## 회귀 가드 명령어

```bash
npx tsc --noEmit
npx tsx --require ./tests/_stubs/setup.cjs --test tests/i18n-meta.test.ts tests/i18n-completeness.test.ts tests/i18n.test.ts
npx tsx scripts/check-i18n-keys.ts
```

## 범위 외

- i18next 같은 라이브러리 도입은 본 구조의 범위 밖입니다.
- 지역(region)별 분기(`en-GB` vs `en-US` 다른 문자열)는 미지원 — 1차 서브태그로 단일화합니다.
