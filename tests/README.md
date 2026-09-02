# 테스트

## 단위 테스트 (Jest)

`npm test`가 로컬과 CI의 기본 단위 테스트 명령입니다. 테스트 파일 중 일부는
Node.js 내장 `node:test` API를 사용하지만 Jest 어댑터를 통해 실행됩니다.
React Native 컴포넌트는 순수 로직 테스트와 별도의 E2E로 검증합니다.

### 실행

```bash
# 전체 단위 테스트 (CI와 동일)
npm test

# 단일 테스트
npx jest tests/i18n.test.ts --runInBand
```

Jest 설정이 React Native, Expo, `.wav`/`.mp3` 자산을 자동으로 stub 처리합니다.

## 정적 검사

```bash
# 프런트엔드 TypeScript
npm run typecheck

# 서버·공유 코드 TypeScript
npm run typecheck:server

# 생성물·캐시·Jest 실행 shim을 제외한 소스 lint
npm run lint
```

`tests/_stubs/`는 Jest와 Node 전역을 흉내 내는 실행 보조 코드라 일반 소스
lint 대상에서 제외합니다.

## E2E 테스트 (Playwright)

실제 브라우저에서 실행하는 UI 통합 테스트.  
테스트 파일 위치: `e2e/` 폴더.  
설정 파일: `playwright.config.ts` (baseURL: `http://localhost:8081`).

### 실행

```bash
# Expo 웹 앱이 포트 8081에서 실행 중이어야 함
npm run test:e2e

# 알려진 제품 실패를 포함한 모든 E2E
npm run test:e2e:all

# 단일 시나리오
npx playwright test e2e/modal-open-close.spec.ts
```

### 현재 E2E 커버리지

- `e2e/modal-open-close.spec.ts` — AnimatedModal 기반 모달 열기/닫기
  - 메인 메뉴 열기 → 항목(설정·연습장·음원 분리...) 표시 → backdrop 닫기
  - 설정 모달 열기 → 내용 표시 → X 버튼 닫기
  - 메인 메뉴 → 음원 분리 항목 클릭 → 음원 분리 모달 열기 → X 닫기
- `e2e/score-note-preview-setting.spec.ts` — 악보 음표 미리 듣기 설정
- `e2e/signal-generator-scroll.spec.ts` — 작은 화면 신호 발생기 스크롤 및 재생
  - 현재 짧은 화면에서 모달 스크롤 영역이 뷰포트보다 커지면서 실제로 스크롤되지
    않는 제품 버그를 재현하므로 `@known-failure`로 표시합니다.
  - 기본 CI에서는 제외하고 `npm run test:e2e:all`에서 계속 재현합니다.
  - 짧은 화면 모달 스크롤 문제가 해결되면 태그를 제거해 기본 CI에 포함합니다.
- `e2e/subdivision-shake-reset.spec.ts` — 웹 서브디비전 흔들기 초기화
- `e2e/subdivision-type-picker.spec.ts` — 서브디비전 타입 선택

CI는 `npm run test:e2e`로 `@known-failure`를 제외한 E2E를 모두 실행합니다.
새 E2E 파일은 별도 목록 수정 없이 자동으로 CI에 포함되며, 제외가 필요하면 재현
가능한 제품 버그와 해제 조건을 이 문서에 기록해야 합니다. 일시적인 브라우저 시작
실패를 위해 CI에서 한 번 재시도하고, 실패 시 trace·video·screenshot 결과를
artifact로 보존합니다.

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
