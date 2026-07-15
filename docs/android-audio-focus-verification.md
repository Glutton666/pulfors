# Android 오디오 포커스 프로브 — 전화 통화 종료 후 메트로놈 자동 재개 검증

**작성일**: 2026-05-04
**관련 파일**:
- `lib/android-audio-focus.ts` (프로브 구현)
- `lib/audio-session.ts` (`notifyInterruptionBegin/End`, `registerAndroidFocusProbeController`)
- `app/_layout.tsx` (프로브 초기화 진입점)

---

## 검증 상태

| 검증 계층 | 상태 |
|----------|------|
| JS 로직 단위 테스트 (시뮬레이터) | ✅ 완료 — 12/12 pass |
| CI Android 에뮬레이터 E2E (GSM 시뮬레이션) | ⏳ 대기 — GitHub Actions 수동 실행 필요 |
| 실제 Android 물리 기기 런타임 | ⬜ 미수행 — [하단 체크리스트](#실기기-검증-체크리스트) 참고 |

**Replit 클라우드 환경에는 Android 에뮬레이터가 없다.**
E2E 자동화는 GitHub Actions 워크플로우(`.github/workflows/android-audio-focus-e2e.yml`)를
통해 실행한다.

### CI E2E 자동화 실행 방법

```bash
# GitHub 저장소 → Actions 탭 →
# "Android 오디오 포커스 E2E (전화 수신 시뮬레이션)" → "Run workflow"
# API 레벨 선택 (기본값 29) 후 실행
```

워크플로우가 완료되면 `scripts/android-phone-call-e2e.sh`가 검증 결과를
이 문서의 [CI 자동화 결과 섹션](#계층-2-a-ci-자동화-테스트-결과-android-에뮬레이터)에
자동으로 기록하고 커밋한다.

팀원이 Android 물리 기기로 추가 검증을 수행하려면
[하단 실기기 체크리스트](#실기기-검증-체크리스트)를 참고한다.

---

## 배경 — 프로브 동작 원리

Android에서는 `AppState 'inactive'`가 거의 발생하지 않아 전화 수신 같은
포그라운드 인터럽션을 AppState만으로 감지할 수 없다. `lib/android-audio-focus.ts`는
**expo-av Sound를 오디오 포커스 프로브**로 사용해 이 문제를 해결한다.

```
메트로놈 재생 시작
  └─ startAndroidFocusProbe()
       └─ volume=0, isLooping=true, shouldDuckAndroid=false 로 Sound 생성
            └─ onPlaybackStatusUpdate 콜백 등록

전화 수신 → OS가 오디오 포커스 탈취
  └─ Sound.isPlaying → false
       └─ handlePlaybackStatus → onFocusLoss → notifyInterruptionBegin()
            └─ bridge.pause()  ← 프로브는 살아있음 (핵심 불변식)

통화 종료 → OS가 오디오 포커스 반환
  └─ OS가 Sound를 자동 재개 → Sound.isPlaying → true
       └─ handlePlaybackStatus → onFocusGain → notifyInterruptionEnd()
            └─ bridge.resume()  ← 메트로놈 자동 재개
```

**핵심 불변식**: `notifyInterruptionBegin()`은 `stopAndroidFocusProbe()`를 절대 호출하지
않는다. 프로브가 살아있어야 OS의 포커스 반환 이벤트(`isPlaying: true`)를 받을 수 있다.

---

<!-- CI_RESULTS_START -->
## 계층 2-A: CI 자동화 테스트 결과 (Android 에뮬레이터)

> 이 섹션은 GitHub Actions 워크플로우(`android-audio-focus-e2e.yml`)가 자동 갱신합니다.
> 아직 실행된 적 없습니다. 워크플로우를 수동으로 실행하면 결과가 여기에 기록됩니다.

| 항목 | 값 |
|------|-----|
| 실행 일시 | — |
| 기기 모델 | — |
| Android API | — |
| 시나리오 A (전화 수신/거절) | — |
| 시나리오 B (통화 수락/종료) | — |
| 시나리오 C (3회 반복 사이클) | — |
| **전체 결과** | **미실행** |
<!-- CI_RESULTS_END -->

---

## 계층 1: JS 로직 단위 테스트 (실제 실행 결과 — 2026-05-04)

### 테스트 환경

| 항목 | 값 |
|------|-----|
| 실행 환경 | Replit (NixOS Linux) |
| Node.js | v22.22.0 |
| tsx | v4.21.0 |
| expo-av MockSound | `tests/_stubs/setup.cjs` 제공 |
| 실행 명령 | `npx tsx --require ./tests/_stubs/setup.cjs --test tests/android-audio-focus.test.ts` |

### 실제 TAP 출력 (2026-05-04 캡처)

```
TAP version 13
ok 1  - iOS에서 initAndroidFocusCallbacks는 no-op이다             (1.009ms)
ok 2  - iOS에서 startAndroidFocusProbe는 Sound를 생성하지 않는다   (0.312ms)
ok 3  - Android에서 startAndroidFocusProbe가 Sound를 생성한다      (56.231ms)
ok 4  - startAndroidFocusProbe는 멱등하다                          (11.898ms)
ok 5  - isPlaying이 false가 되면 onFocusLoss가 호출된다            (11.653ms)
ok 6  - isPlaying이 다시 true가 되면 onFocusGain이 호출된다        (12.880ms)
ok 7  - onFocusLoss는 중복 호출되지 않는다 (멱등)                   (11.554ms)
ok 8  - onFocusGain은 중복 호출되지 않는다 (멱등)                   (12.589ms)
ok 9  - stopAndroidFocusProbe 후에는 콜백이 호출되지 않는다         (15.848ms)
ok 10 - isLoaded: false 상태는 무시된다                             (12.096ms)
ok 11 - 포커스 손실 후 프로브가 살아있어 onFocusGain 감지 가능       (13.823ms)
ok 12 - 포커스 손실/회복 사이클 3회 반복도 정상 동작                  (11.870ms)

# tests 12  pass 12  fail 0  duration_ms 598
```

### 시나리오별 로그 (실측 — MockSound._emit으로 OS 이벤트 재현)

**전화 수신 → 메트로놈 일시정지 → 통화 종료 → 자동 재개** (테스트 #6):

```
[androidFocus] expo-av focus probe started
[androidFocus] audio focus lost → calling onFocusLoss        ← isPlaying:false 주입
[androidFocus] audio focus regained → calling onFocusGain    ← isPlaying:true 주입
[androidFocus] expo-av focus probe stopped
```

**다른 앱 재생/종료 3회 반복** (테스트 #12):

```
[androidFocus] expo-av focus probe started
[androidFocus] audio focus lost → calling onFocusLoss
[androidFocus] audio focus regained → calling onFocusGain
[androidFocus] audio focus lost → calling onFocusLoss
[androidFocus] audio focus regained → calling onFocusGain
[androidFocus] audio focus lost → calling onFocusLoss
[androidFocus] audio focus regained → calling onFocusGain
[androidFocus] expo-av focus probe stopped
```

**포커스 손실 시 프로브 유지 불변식** (테스트 #11):

```
[androidFocus] expo-av focus probe started
[androidFocus] audio focus lost → calling onFocusLoss
  → assert: Sound 객체 != null (프로브 살아있음) — PASS
[androidFocus] audio focus regained → calling onFocusGain
[androidFocus] expo-av focus probe stopped
```

### 단위 테스트 커버리지 요약

| 검증 항목 | 테스트 # | 결과 |
|----------|---------|------|
| iOS에서 프로브 비활성 (격리) | #1, #2 | ✅ PASS |
| Android 프로브 Sound 생성 | #3 | ✅ PASS |
| 프로브 멱등성 (중복 start) | #4 | ✅ PASS |
| 포커스 손실 → `onFocusLoss` 호출 | #5 | ✅ PASS |
| 포커스 회복 → `onFocusGain` 호출 | #6 | ✅ PASS |
| `onFocusLoss` 중복 방어 | #7 | ✅ PASS |
| `onFocusGain` 중복 방어 | #8 | ✅ PASS |
| 정지 후 콜백 없음 | #9 | ✅ PASS |
| `isLoaded:false` 무시 | #10 | ✅ PASS |
| **포커스 손실 시 프로브 유지 불변식** | #11 | ✅ PASS |
| 다회 사이클 반복 (3회) | #12 | ✅ PASS |
| 통화 중 사용자 수동 정지 → 재개 억제 | audio-session #21 | ✅ PASS |

---

## 계층 2: 코드 정적 분석 결과

`app/_layout.tsx`에서의 프로브 연동 구조를 확인했다.

```typescript
// 앱 마운트 시 Android 전용으로 실행
useEffect(() => {
  if (Platform.OS !== "android") return;
  initAndroidFocusCallbacks(notifyInterruptionBegin, notifyInterruptionEnd);
  registerAndroidFocusProbeController({
    start: () => { void startAndroidFocusProbe(); },
    stop: () => { void stopAndroidFocusProbe(); },
  });
  return () => {
    registerAndroidFocusProbeController(null);
    void stopAndroidFocusProbe();
  };
}, []);
```

- `notifyInterruptionBegin`이 `androidProbe?.stop()`을 호출하지 않는 것을 코드에서 확인 (`lib/audio-session.ts` 라인 208-215: 주석으로 명시).
- `notifyInterruptionEnd`도 `androidProbe?.start()`를 호출하지 않는 것을 확인 (라인 270-273: "프로브는 이미 살아있다").

---

## 계층 3: 실기기 검증 체크리스트 (미수행 — 팀원이 완료해야 함)

Android 기기(API ≥ 26) 또는 에뮬레이터에서 아래 체크리스트를 수행하고 결과를 기록한다.

### 환경 준비

- [ ] 기기 모델 / Android API 레벨: `_______________`
- [ ] Expo Go 버전 / 개발 빌드 여부: `_______________`
- [ ] 테스트 일시: `_______________`
- [ ] logcat 필터: `adb logcat -s ReactNativeJS`

### 에뮬레이터 전화 시뮬레이션 명령

```bash
adb -e emu gsm call 5551234567    # 전화 수신
adb -e emu gsm accept 5551234567  # 통화 수락
adb -e emu gsm cancel 5551234567  # 통화 종료
```

### 시나리오 A — 전화 수신/거절

1. 메트로놈 재생 시작
2. 가상 전화 수신 (`gsm call`)
3. **기대**: 메트로놈 일시정지, 로그에 `interruption begin → metronome paused` 출력
4. 전화 거절 (`gsm cancel`)
5. **기대**: 메트로놈 자동 재개, 로그에 `interruption end → metronome resumed` 출력

- [ ] 결과: PASS / FAIL
- [ ] 관찰 로그: `_______________`

### 시나리오 B — 전화 수신/통화 후 종료

1. 메트로놈 재생 시작
2. 전화 수신 후 수락 (`gsm call` → `gsm accept`)
3. **기대**: 메트로놈 일시정지
4. 통화 종료 (`gsm cancel`)
5. **기대**: 메트로놈 자동 재개

- [ ] 결과: PASS / FAIL
- [ ] 관찰 로그: `_______________`

### 시나리오 C — 다른 앱 미디어 재생

1. 메트로놈 재생 시작
2. Spotify 등 다른 앱에서 미디어 재생
3. **기대**: 메트로놈 일시정지
4. 해당 앱 일시정지 또는 완전 종료
5. **기대**: 메트로놈 자동 재개

- [ ] 결과: PASS / FAIL
- [ ] 관찰 로그: `_______________`

### 시나리오 D — 통화 중 사용자 수동 정지

1. 메트로놈 재생 시작
2. 전화 수신 → 메트로놈 자동 일시정지
3. UI에서 Pause 버튼 탭 (수동 정지)
4. 통화 종료
5. **기대**: 메트로놈이 자동 재개되지 **않음** (사용자 의도 존중)

- [ ] 결과: PASS / FAIL
- [ ] 관찰 로그: `_______________`

---

## 알려진 한계

| 항목 | 설명 |
|------|------|
| expo-audio 네이티브 API 미노출 | `addInterruptionListener`가 현재 미노출 → expo-av 폴백으로 동작. 향후 노출 시 자동 전환 |
| Foreground Service 미구성 | 앱 백그라운드 전환 시 OS가 오디오 강제 중단 — 프로브 인터럽션 처리와는 별도 문제 |
| AppState 중복 신호 | Android `'background'` 전환 시 AppState와 프로브 양쪽 신호 가능. `notifyInterruptionBegin/End` 멱등성으로 안전하게 처리 |
