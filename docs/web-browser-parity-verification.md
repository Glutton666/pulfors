# 웹 브라우저 메뉴·음원 복원 검증

## 실행 방법

게시나 공개 주소 변경 없이, 현재 소스의 프로덕션 빌드를 임시 포트 5197에서 검사한다.
각 엔진은 새 브라우저 저장소를 사용한다. 실제 사용자 저장소를 초기화하지 않는다.

Ubuntu/CI:

```sh
npx playwright install --with-deps chromium firefox webkit
npm run release:web:build
node scripts/verify-web-release.mjs --browser --audio-sync --web-parity \
  --browsers=chromium,firefox,webkit
```

`--browsers`를 생략하면 기존처럼 Chromium만 검사한다. 쉼표로 엔진을 선택할 수 있다.
`--screenshot`을 추가하면 시스템 임시 디렉터리에 엔진별 초기 화면을 저장한다.
기존 웹 E2E 워크플로에도 세 엔진의 릴리스 검사를 연결했다.

## 2026-10-04 결과

Linux headless Playwright의 Chromium 151.0.7922.34, Firefox 153.0,
WebKit 26.5에서 아래 항목이 모두 통과했다. WebKit 결과는 **실제 macOS/iOS Safari 결과가 아니다**.

| 실제 UI 동작 / 확인 항목 | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| 단축키 F9 재지정, 초기화 취소/확인 | 통과 | 통과 | 통과 |
| 공유 `/practice?d=…` 링크 취소, 적용만, 저장 후 적용 | 통과 | 통과 | 통과 |
| 적용 BPM 137 표시, 적용만 할 때 연습장 미저장 | 통과 | 통과 | 통과 |
| 연습장 격자 650ms 길게 누르기, 네 선택 표시 | 통과 | 통과 | 통과 |
| 공유 파일 다운로드 및 항목/BPM 확인, 오디오 내보내기 창 열기/닫기 | 통과 | 통과 | 통과 |
| 메뉴 취소·Escape, 항목 삭제 취소/확인 | 통과 | 통과 | 통과 |
| 활동 기록 삭제 취소 시 기록/목표 보존, 확인 시 기록/목표/기록 설정 삭제 | 통과 | 통과 | 통과 |
| 전체 백업 다운로드, 두 음원의 원본 바이트 일치 | 통과 | 통과 | 통과 |
| UI 복원 확인 후 파일 선택 이벤트 및 활성 사용자 제스처 | 통과 | 통과 | 통과 |
| 복원 완료 확인 후 실제 페이지 새로고침, 프로필 복원 | 통과 | 통과 | 통과 |
| 새로고침 후 두 음원의 data URL 유지 및 WAV 디코딩 | 통과 | 통과 | 통과 |
| 재생 시 소스 예약·출력 시각 API 사용, 정지 후 추가 예약 없음 | 통과 | 통과 | 통과 |
| 브라우저 콘솔 error/pageerror 없음 | 통과 | 통과 | 통과 |

음원 fixture만 브라우저 저장소에 준비한다. 메뉴·링크·다운로드·복원·삭제는
앱 핸들러를 직접 호출하거나 DOM 이벤트를 합성하지 않고 Playwright 클릭/키보드/마우스로 실행한다.
파일 선택은 OS 창을 자동으로 조작할 수 없어 `filechooser.setFiles`로 파일을 전달한다.
OS 파일 선택창의 화면이나 iOS 파일 제공자 동작은 이 검사로 확인하지 않는다.

- 첫 음원: 440Hz / 0.1초 WAV, blob URL, `#s=0.01&e=0.09` 구간 정보 포함.
- 둘째 음원: 660Hz / 0.1초 WAV, data URL.
- 백업의 `audioFiles`가 정확히 두 개이며 두 원본 base64와 일치해야 한다.
- 복원 후 둘 다 지속 가능한 `data:audio/wav;base64,…`로 바뀌어야 한다.
- 새 페이지에서 `fetch` + `decodeAudioData`로 0.1초 길이를 확인하고 양의 영점 교차 수로
  서로 다른 주파수의 내용이 보존됐는지 확인한다. 첫 음원의 구간 정보도 보존해야 한다.
- 마지막 실행의 교차 수: Chromium/Firefox 43·65, WebKit 44·66 (허용 오차 ±1).
- 세 엔진 모두 파일 input 클릭 시 `navigator.userActivation.isActive === true`.
- 세 엔진 모두 출력 timestamp API를 지원했다. 스크립트는 지원하지 않는 엔진에서는
  latency 속성 읽기를 검사한다. 이번 실행에서 그 대체 경로의 브라우저 검증은 수행되지 않았다.

## 발견·수정한 문제

Escape의 keydown으로 웹 확인창을 닫은 뒤 keyup이 뒤의 React Native Web Modal까지 닫았다.
웹 확인창이 키를 놓는 이벤트까지 차단하도록 수정했다. 같은 Escape로 뒤의 설정창이
닫히지 않는 것은 세 브라우저의 후속 격자 조작 및 단위 회귀 테스트로 확인했다.
네이티브 Alert 경로는 바꾸지 않았다.

추가 확인: TypeScript 검사 통과, 관련 단위 테스트 6개 파일/106개 항목 통과.
변경 파일 ESLint 오류 0개 (연습장 파일의 기존 경고 11개).

## Linux/Nix 실행 환경 주의

이번 Replit 작업 환경에서는 시스템 라이브러리를 `replit.nix`에 추가했다.
추가 Nix 런타임 검색 경로는 `PLAYWRIGHT_LD_LIBRARY_PATH`로 전달할 수 있으며,
스크립트는 이를 브라우저 검증/실행에만 적용한다. Node 프로덕션 서버에는 적용하지 않는다.

로컬 WebKit 준비 과정에서 다음 환경 차이를 처리했다. 앱 코드나 오디오 API를 mock하지 않았다.

- Playwright Linux MiniBrowser의 캐시 실행 래퍼가 기존 `LD_LIBRARY_PATH`를 덮어쓰므로,
  이 작업 환경의 캐시 래퍼에 추가 검색 경로를 보존했다. 재설치하면 캐시 변경은 사라진다.
- WebKit 바이너리가 요구하는 ICU 74 등은 정확한 ABI와 x86-64 라이브러리를 사용했다.
- Nix GStreamer의 libsoup2 플러그인과 WebKit의 libsoup3가 충돌했다.
  로컬 검증에서는 core/base/good 플러그인을 사용하되 soup 플러그인을 제외했다.
  WAV 디코딩과 Web Audio 소스 예약은 실제 엔진으로 실행했다.
- Playwright의 일부 라이브러리 검사는 `ldconfig` 캐시만 보므로 Nix 검색 경로를
  반영하지 못했다. 로컬 실행만 `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`을 사용했다.
  브라우저 시작, 앱 검사, 디코딩 또는 콘솔 오류 검사는 생략하지 않았다.
  Ubuntu CI에서는 이 우회나 캐시 래퍼 수정 없이 공식 `install --with-deps`를 사용한다.

## 브라우저 API로 확인할 수 없는 항목

이 검사는 예약된 오디오와 브라우저 시각 API 사용을 확인한다.
스피커에서 실제 소리가 났다는 증거, 화면과 실제 소리의 오차 측정, Bluetooth 지연 측정이 아니다.
0.1초 디코딩 성공 역시 실제 출력 장치의 음질·볼륨·지연을 보장하지 않는다.

실제 기기 검증에서는 별도로:

1. macOS Safari와 iPhone/iPad Safari에서 공유 링크를 열어 적용/저장을 확인한다.
2. 파일 앱/다운로드에서 백업 파일을 선택해 복원하고 브라우저를 새로고침한다.
3. 내장 스피커·유선·Bluetooth 각각에서 재생/정지와 두 음원을 직접 듣는다.
4. 고속 촬영 또는 루프백 측정으로 화면과 물리적 출력의 시간 차이를 기록한다.
   기기, OS/Safari 버전, 출력 장치, BPM, 브라우저가 보고한 latency도 함께 남긴다.
5. 백그라운드·화면 잠금·블루투스 재연결은 별도 실제 기기 시나리오로 확인한다.

이 항목들은 아직 실행하지 않았다. 공개 배포와 기존 주소 변경도 수행하지 않았다.