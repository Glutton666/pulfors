# 알림 BPM 조정 action 검증

## 정책

- `BPM_DOWN`, `BPM_UP`: `opensAppToForeground: false`
  - 알림에서 템포만 조정할 때 앱 화면을 열지 않는다.
- `TOGGLE_PLAY`: `opensAppToForeground: true`
  - 재생 상태를 눈으로 확인하거나 화면에서 이어서 조작할 수 있도록 기존 정책을 유지한다.

`addNotificationActionListener`는 앱이 살아 있을 때의 response listener와, 앱 시작 뒤 `getLastNotificationResponseAsync`로 확인하는 cold-start 경로를 모두 유지한다.

## 플랫폼 차이

`opensAppToForeground: false`는 action을 누를 때 앱 UI를 자동으로 전면화하지 않도록 요청한다. 다만 운영체제는 종료된 앱의 notification response를 전달하기 위해 프로세스를 시작하거나 재개할 수 있다. 그 경우에도 화면 전면 표시 여부와 background 실행 가능 여부는 OS 버전·제조사·개발/standalone 빌드 설정에 따라 달라질 수 있다.

Expo Go에서는 notification action의 네이티브 category 동작을 제공하지 않으므로, 아래 검증은 개발 빌드 또는 standalone 빌드에서 수행한다.

## 수동 검증 체크리스트

| 플랫폼 | 빌드 | 확인 절차 | 기대 결과 |
| --- | --- | --- | --- |
| Android | 개발/standalone | 재생 → 홈 화면 → 알림 `− BPM` 또는 `+ BPM` 1회 누름 | 앱 UI를 열지 않고 BPM이 ±1, 알림 제목이 새 BPM으로 갱신 |
| Android | 개발/standalone | 같은 방향 action을 300ms 안에 2회 누름 | BPM이 ±5, 20–300 범위를 넘지 않음 |
| Android | 개발/standalone | 재생 중 action 누름 | 재생 엔진 tempo와 알림 BPM이 함께 갱신 |
| iOS | 개발/standalone | 잠금 화면/알림 센터에서 `− BPM` 또는 `+ BPM` 누름 | 앱 UI를 자동 전면화하지 않고, 시스템이 response를 전달하는 경우 BPM과 알림이 갱신 |
| iOS | 개발/standalone | 앱을 종료한 뒤 action 누름, 이후 앱 열기 | cold-start response가 한 번만 처리되고 BPM 값이 보존 |
| Android/iOS | 개발/standalone | `▶/⏸` action 누름 | 기존 전면 표시 정책과 재생 토글 동작 유지 |

실기기 확인 결과에는 OS 버전, 기기 모델, 빌드 종류와 cold-start에서 관찰된 시스템 동작을 함께 기록한다.