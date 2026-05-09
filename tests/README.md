# 테스트

## 단위 테스트 (node:test)

순수 로직 단위 테스트 (Node.js 내장 `node:test` + `tsx` 런타임 사용).
React Native 컴포넌트는 테스트하지 않습니다 (런타임이 다름) — pure module만 다룹니다.

### 실행

```bash
# 전체 테스트 (자산/RN/expo-haptics stub 자동 적용)
npx tsx --require ./tests/_stubs/setup.cjs --test tests/*.test.ts

# 단일 테스트
npx tsx --require ./tests/_stubs/setup.cjs --test tests/i18n.test.ts
```

> `--require ./tests/_stubs/setup.cjs`는 React Native, expo-haptics, .wav/.mp3
> 자산 임포트를 Node에서 stub 처리합니다. 누락 시 Flow 타입 또는 바이너리
> 파싱 에러가 납니다.

## E2E 테스트 (Playwright)

실제 브라우저에서 실행하는 UI 통합 테스트.  
테스트 파일 위치: `e2e/` 폴더.  
설정 파일: `playwright.config.ts` (baseURL: `http://localhost:8081`).

### 실행

```bash
# Expo 웹 앱이 포트 8081에서 실행 중이어야 함
npx playwright test e2e/modal-open-close.spec.ts
```

### 현재 E2E 커버리지

- `e2e/modal-open-close.spec.ts` — AnimatedModal 기반 모달 열기/닫기
  - 메인 메뉴 열기 → 항목(설정·연습장·그 외...) 표시 → backdrop 닫기
  - 설정 모달 열기 → 내용 표시 → X 버튼 닫기
  - MoreMenu 모달 열기 → 4개 항목(예약시작·페이드아웃·드럼킷·템포퀴즈) 표시 → backdrop 닫기

## 단위 테스트 현재 커버리지

- `tests/i18n.test.ts` — 번역 키 양 언어 존재 검증 + 헬퍼 함수
- `tests/metronome-engine.test.ts` — 엔진 생성/BPM clamp/박자 설정
- `tests/storage-notifier.test.ts` — 저장 실패 이벤트 버스
- `tests/animated-modal.test.ts` — AnimatedModal/AnimatedSlideModal 상태머신 + modal-routing 순수 로직 (37개)
- ... (기타 다수)

## 테스트 추가 가이드

순수 모듈 (lib/*.ts 중 React Native 의존성 없는 파일) 우선.
React Native 모듈을 import 하는 경우 `tests/_stubs/setup.cjs`의 `STUB_MAP`에
모듈 → stub 파일 매핑을 추가합니다. 자산 확장자도 `ASSET_EXTS` 배열에 추가 가능.
