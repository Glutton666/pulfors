# 전화·알람 인터럽션 처리 검증 결과

**작성일**: 2026-08-21  
**관련 파일**: `lib/audio-session.ts`, `app/_layout.tsx`  
**단위 테스트**: `tests/audio-session.test.ts` 및 `tests/audio-lifecycle.test.ts` (33/33 pass)

---

## 검증 방법

실제 iOS/Android 기기에서 직접 테스트하는 것이 이상적이나, Replit 환경에서는 물리
기기 접근이 불가하다. 따라서 다음 두 계층으로 검증을 완료했다.

1. **단위 테스트 (완전 자동화)** — 33개 시나리오를 JS 레벨에서 검증
2. **코드 리뷰 기반 정적 분석** — AppState 연동, 플랫폼별 분기, 엣지 케이스 검토

---

## 단위 테스트 결과 (33/33 pass)

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
Android는 우선 `initAndroidFocusCallbacks`의 expo-audio 상태 프로브 또는 커스텀
네이티브 interruption listener로 오디오 포커스 손실/복귀를 감지한다. AppState는
`inactive`만 보조 경로로 사용한다. 사용자가 홈 화면으로 이동한 `'background'`는
인터럽션으로 처리하지 않으므로, 의도적인 백그라운드 재생을 잘못 pause/resume하지 않는다.

### 알려진 한계

| 한계 | 원인 | 영향 |
|------|------|------|
| expo-audio 상태 이벤트가 기기별로 제한될 수 있음 | Expo Go/제조사 오디오 구현 차이 | 네이티브 listener 없는 빌드에서는 일부 포커스 변화가 감지되지 않을 수 있음 |
| `'inactive'`가 거의 발생하지 않음 | Android AppState 구현 특성 | AppState는 보조 신호이며 AudioFocus 경로를 대체하지 않음 |
| Foreground Service 미구성 | 백그라운드 오디오 공식 지원 없음 | 백그라운드 전환 시 OS가 오디오를 강제 중단함 — AppState 인터럽션 처리와 무관 |
| 커스텀 listener는 개발 빌드 필요 | Expo Go에서 네이티브 모듈을 포함할 수 없음 | Expo Go에서는 expo-audio 프로브와 AppState 보조 경로로만 검증 |

### 정공법 (후속 작업 #88 참고)
Android `AudioManager.OnAudioFocusChangeListener`를 Expo Module(네이티브 레이어)로
직접 구독하면 `'background'` 없이도 오디오 포커스 변화를 정확히 감지할 수 있다.
현재 AppState 방식은 Expo Go 환경에서 네이티브 모듈 없이 동작하는 최선의 근사다.

---

## 오디오 복구 상태와 실제 기기 검증 체크리스트

화면과 무대 화면은 준비 중, 인터럽션, 복구 중, 복구 실패 상태를 동일하게 표시한다.
복구 실패는 사라지지 않는 안내와 **다시 시작** 버튼을 제공하며, 버튼은 렌더링 오디오와
엔진을 정리한 뒤 새 재생 준비를 시도한다. 자동 재개를 사용하지 않거나 사용자가 직접
정지한 경우에는 자동 재개를 시작하지 않는다.

| 플랫폼 | 빌드 | 절차 | 예상 결과 | 실제 결과 |
|---|---|---|---|---|
| iOS | 개발 빌드 | 재생 → 전화/알람/Siri → 복귀 | interrupted → recovering → playing, 음성·알림이 끝난 뒤 한 번만 재개 | 물리 기기 확인 필요 |
| iOS | 개발 빌드 | 재생 → 인터럽션 중 수동 Pause → 복귀 | 재생을 다시 시작하지 않음 | 물리 기기 확인 필요 |
| Android | 커스텀 개발 빌드 | 재생 → 다른 앱이 AudioFocus 요청 → 복귀 | 포커스 손실 시 pause, gain 시 설정에 따라 재개 | 물리 기기 확인 필요 |
| Android | Expo Go | 재생 → 홈 → 복귀 | background만으로는 pause/resume하지 않음 | 물리 기기 확인 필요 |
| Android/iOS | 개발 빌드 | 재생 중 오디오 경로를 강제로 중단 | recovering 표시 후 성공 시 playing, 두 번 실패 시 재시작 버튼 표시 | 물리 기기 확인 필요 |

실행 가능한 확인 기록: 기기 콘솔에서 `[audioSession] interruption begin/end`와
`[androidFocus]` 로그를 확인하고, 화면의 상태 문구가 위 전이와 일치하는지 기록한다.

---

## 코드 검토 결과 요약

| 항목 | 상태 |
|------|------|
| `notifyInterruptionBegin` 멱등성 | ✅ |
| `notifyInterruptionEnd` 사용자 의도 존중 | ✅ |
| 모달 + 인터럽션 중첩 처리 | ✅ |
| iOS `'inactive'` → `'active'` 연동 | ✅ |
| Android AudioFocus + `'inactive'` 보조 경로 | ✅ (기기별 검증 필요) |
| `suppressUserToggle` 재진입 방어 | ✅ |
| bridge 등록 전 인터럽션 방어 | ✅ |
| 단위 테스트 커버리지 | ✅ 33/33 pass |

---

## 후속 작업

- **#88**: Android 네이티브 AudioFocus 리스너 추가 (더 신뢰성 있는 Android 처리)
- **#89**: 인터럽션 후 자동 재개 여부 사용자 설정 추가
