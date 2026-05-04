# 전화·알람 인터럽션 처리 검증 결과

**작성일**: 2026-05-04  
**관련 파일**: `lib/audio-session.ts`, `app/_layout.tsx`  
**단위 테스트**: `tests/audio-session.test.ts` (25/25 pass)

---

## 검증 방법

실제 iOS/Android 기기에서 직접 테스트하는 것이 이상적이나, Replit 환경에서는 물리
기기 접근이 불가하다. 따라서 다음 두 계층으로 검증을 완료했다.

1. **단위 테스트 (완전 자동화)** — 25개 시나리오를 JS 레벨에서 검증
2. **코드 리뷰 기반 정적 분석** — AppState 연동, 플랫폼별 분기, 엣지 케이스 검토

---

## 단위 테스트 결과 (25/25 pass)

실행 명령:

```
npx tsx --require ./tests/_stubs/setup.cjs --test tests/audio-session.test.ts
```

| # | 시나리오 | 결과 |
|---|---------|------|
| 1 | acquire(recording) → 메트로놈 일시정지, release → 자동 재개 | ✅ |
| 2 | playback 모드는 메트로놈을 건드리지 않음 | ✅ |
| 3 | 여러 caller 중 마지막 release 시점에만 재개 | ✅ |
| 4 | 메트로놈이 이미 꺼져 있으면 pause/resume 카운트 0 | ✅ |
| 5 | withAudioSession — 예외 발생 시에도 release 보장 | ✅ |
| 6 | 알 수 없는 caller release는 no-op (빈 Map 시 보호) | ✅ |
| 7 | 모달 안에서 사용자가 직접 재생 켰다가 끈 경우 자동 재개 안 함 | ✅ |
| 8 | withAudioSession — 동기 throw도 release 보장 | ✅ |
| 9 | 모달 안 user toggle 후 다시 끔 → 자동 재개 skip | ✅ |
| 10 | bridge.pause/resume 호출 경로가 user toggle로 오인되지 않음 | ✅ |
| 11 | acquire 직후 release(race condition) → 누출 caller 없음 | ✅ |
| 12 | record() 실패 catch → release → 메트로놈 정상 재개 | ✅ |
| 13 | iOS 네이티브 마이크 실패 → Android WebView 폴백 overlap 처리 | ✅ |
| 14 | 활성 세션 없을 때 user toggle은 no-op | ✅ |
| 15 | 모달 실패 경로(prepare 실패) release 후 자동 재개 | ✅ |
| 16 | 이중 release → resume 한 번만 | ✅ |
| 17 | **인터럽션 begin → 메트로놈 pause, end → 자동 재개** | ✅ |
| 18 | 인터럽션 begin 멱등성 (3회 호출 → pause 1회) | ✅ |
| 19 | 인터럽션 end without begin → no-op | ✅ |
| 20 | 메트로놈 꺼진 상태에서 인터럽션 → pause/resume 없음 | ✅ |
| 21 | 인터럽션 중 사용자 직접 stop → 자동 재개 억제 | ✅ |
| 22 | 모달 열림 중 전화 → 모달 닫혀도 재개 안 함 → 통화 끝나면 재개 | ✅ |
| 23 | 인터럽션 중 모달 열림 → 인터럽션 끝나도 재개 안 함 → modal release 후 재개 | ✅ |
| 24 | bridge 등록 전 인터럽션 begin → 나중에 end 와도 잘못된 재개 없음 | ✅ |
| 25 | 인터럽션 begin→end 3회 반복 → pause/resume 각 3회 | ✅ |

---

## iOS 예상 동작 (코드 분석 기반)

### 메커니즘
`app/_layout.tsx`에서 `AppState.addEventListener("change", ...)` 구독:
- `'inactive'` → `notifyInterruptionBegin()` 호출
- `'active'` 복귀 → `notifyInterruptionEnd()` 호출

`shouldPlayInBackground: true`와 UIBackgroundModes `"audio"` 설정으로 사용자가
의도적으로 백그라운드 전환(`'background'`)한 경우에는 메트로놈이 계속 재생된다.
전화/Siri/알람 등 OS 인터럽션만 `'inactive'`를 경유하므로 의도와 인터럽션을
구분할 수 있다.

### 시나리오별 예상 결과

| 시나리오 | AppState 전이 | 기대 동작 |
|---------|-------------|---------|
| 전화 수신 (거절) | active → inactive → active | pause → resume |
| 전화 수신 (통화 후 종료) | active → inactive → active | pause → resume |
| Siri 호출 후 닫기 | active → inactive → active | pause → resume |
| 알람 울림 후 닫기 | active → inactive → active | pause → resume |
| 다른 앱 미디어 재생 (interruptionMode: mixWithOthers) | 전이 없을 수 있음 | mixWithOthers 설정으로 공존, 전이 없으면 no-op |
| 홈 버튼(백그라운드 전환) | active → background | **변화 없음** (메트로놈 계속 재생) |
| 인터럽션 중 사용자가 수동으로 Pause | inactive 상태 동안 UI 조작 | 통화 종료 후 자동 재개 억제 |

### 확인 방법 (기기 테스트 시)
Expo Go / 개발 빌드 콘솔에서 다음 로그 시퀀스를 확인:

```
[appState] → inactive (interruption states: inactive)
[audioSession] interruption begin → metronome paused
... (전화 통화) ...
[appState] → active (interruption states: inactive)
[audioSession] interruption end → metronome resumed
```

---

## Android 동작 및 한계

### 메커니즘
`interruptStates`를 `["background", "inactive"]`로 설정해 두 가지 모두를 인터럽션으로 처리.

### 알려진 한계

| 한계 | 원인 | 영향 |
|------|------|------|
| `'inactive'`가 거의 발생하지 않음 | Android AppState 구현 특성 | 전화 수신 신호가 `'background'`로 오거나 아예 없을 수 있음 |
| 사용자 홈 버튼과 OS 인터럽션 구분 불가 | AppState만으로는 두 경우 모두 `'background'` | 사용자가 홈 버튼 후 돌아오면 메트로놈이 자동 재개될 수 있음 |
| Foreground Service 미구성 | 백그라운드 오디오 공식 지원 없음 | 백그라운드 전환 시 OS가 오디오를 강제 중단함 — AppState 인터럽션 처리와 무관 |
| AudioFocus 콜백 미구독 | `expo-audio`가 JS 레벨 AudioFocus 콜백 미노출 | 전화 수신 외에도 다른 앱의 오디오 포커스 요청에 반응하지 못할 수 있음 |

### 정공법 (후속 작업 #88 참고)
Android `AudioManager.OnAudioFocusChangeListener`를 Expo Module(네이티브 레이어)로
직접 구독하면 `'background'` 없이도 오디오 포커스 변화를 정확히 감지할 수 있다.
현재 AppState 방식은 Expo Go 환경에서 네이티브 모듈 없이 동작하는 최선의 근사다.

---

## 코드 검토 결과 요약

| 항목 | 상태 |
|------|------|
| `notifyInterruptionBegin` 멱등성 | ✅ |
| `notifyInterruptionEnd` 사용자 의도 존중 | ✅ |
| 모달 + 인터럽션 중첩 처리 | ✅ |
| iOS `'inactive'` → `'active'` 연동 | ✅ |
| Android `'background'`/`'inactive'` 인터럽션 근사 | ✅ (한계 있음) |
| `suppressUserToggle` 재진입 방어 | ✅ |
| bridge 등록 전 인터럽션 방어 | ✅ |
| 단위 테스트 커버리지 | ✅ 25/25 pass |

---

## 후속 작업

- **#88**: Android 네이티브 AudioFocus 리스너 추가 (더 신뢰성 있는 Android 처리)
- **#89**: 인터럽션 후 자동 재개 여부 사용자 설정 추가
