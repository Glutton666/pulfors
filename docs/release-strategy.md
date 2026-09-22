# PulFors 릴리스 운영

PulFors는 웹과 iOS·Android에 같은 Expo 소스 트리를 사용한다. 별도 웹 프로젝트로 코드를 복사하지 않는다. 공통 기능은 한 번만 개발하고, 플랫폼 차이가 필요한 모듈만 `.web.tsx`와 `.native.tsx` 또는 명시적인 `Platform` 분기로 격리한다.

## 지원 범위

| 영역 | 웹 | iOS·Android | 원칙 |
| --- | --- | --- | --- |
| 메트로놈 엔진, 비트·바·악보 모드 | 지원 | 지원 | 공통 소스와 공통 테스트 사용 |
| 테마, 번역, 연습장, 백업 형식 | 지원 | 지원 | 저장 매체 차이만 플랫폼 내부에서 처리 |
| Web Audio, 키보드 단축키, 브라우저 파일 API | 지원 | 해당 없음 | 웹 전용 경계에 둔다 |
| 햅틱, 알림, 오디오 포커스, 백그라운드 서비스 | 해당 없음 | 지원 | 네이티브 전용 경계에 둔다 |
| 마이크·파일 선택 | 지원 | 지원 | 사용자 흐름은 공통, 장치 API 구현만 분리 |

새 기능은 기본적으로 공통 구현한다. 운영체제 API가 필요한 부분만 플랫폼 전용으로 분리하며, 화면 전체나 비즈니스 로직을 복사하지 않는다.

## 공통 변경 작업

1. 현재 프로젝트에서 기능을 한 번 수정한다.
2. `npm run release:shared:check`로 웹·모바일이 공유하는 타입과 테스트를 확인한다.
3. 필요하면 웹 또는 모바일 검사를 추가로 실행한다.
4. 같은 커밋에서 웹 Publish와 모바일 스토어 제출 시점을 따로 선택한다.

## 웹 릴리스

웹은 Replit Publish를 사용하며 모바일 빌드를 요구하지 않는다.

```bash
npm run release:web:check
```

이 명령은 공통 검사, 정적 분석, Expo Web 정적 빌드, 서버 빌드 후 프로덕션 서버를 임시 포트로 실행한다. `/`, SPA 직접 경로, `/api/time`, 알 수 없는 API 경계를 검사한다. CI는 같은 프로덕션 빌드를 Chromium으로 열어 실제 JavaScript 번들이 로드되고 앱 루트가 렌더링되는지도 확인한다.

검사가 통과하면 Replit에서 Publish한다. Publish 후에는 실제 공개 주소에서 다음을 확인한다.

- 루트와 직접 경로 새로고침
- 메트로놈 시작·정지와 BPM 조절
- 설정 저장
- 이미지·글꼴·오디오 자산
- 치명적인 브라우저 콘솔 오류

## iOS·Android 릴리스

모바일은 EAS production 프로필을 사용하며 웹 Publish와 독립적이다.

```bash
npm run release:native:check
npm run release:ios
npm run release:android
```

`release:native:check`는 공통 검사와 정적 분석, Expo prebuild 설정 확인, iOS·Android JavaScript 번들 생성을 수행한다. 실제 Xcode·Gradle 컴파일과 서명 검증은 다음 EAS production 빌드에서 수행하며, Expo 계정과 서명 자격 증명이 연결된 환경이 필요하다. 릴리스 명령은 이 사전 검사를 항상 먼저 실행한다.

스토어 제출은 빌드 검증과 실제 기기 확인 후 별도로 실행한다.

```bash
npm run submit:ios
npm run submit:android
```

## 릴리스 시점 예시

공통 기능을 월요일에 병합하고 웹을 즉시 Publish할 수 있다. 같은 변경을 포함한 iOS·Android 앱은 실제 기기 확인과 스토어 준비가 끝난 금요일에 제출할 수 있다. 모바일용으로 코드를 다시 작성하거나 웹 프로젝트에 변경을 복사하지 않는다.

## 후속 기능

PWA, 웹 광고, 커스텀 도메인, 계정 기반 동기화는 이 공통 릴리스 구조가 통과한 뒤 별도 작업으로 진행한다.