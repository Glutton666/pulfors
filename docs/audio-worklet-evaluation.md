# AudioWorklet 도입 검토

검토일: 2026-09-03  
결정: **보류 — 현재의 프리렌더 + Web Audio look-ahead 구조를 유지한다.**

AudioWorklet 자체는 현재 주요 브라우저에서 충분히 지원되고 Expo 정적 배포에도
실을 수 있다. 그러나 PulFors의 웹 가청 경로는 이미 `AudioBufferSourceNode`를
`AudioContext.currentTime`에 예약한다. Bar/custom 모드는 한 번 프리렌더한
`AudioBufferSourceNode`가 오디오 렌더링 스레드에서 반복되고, 기본 Beat 모드
fallback도 160 ms 앞까지 오디오 시계에 예약한다. 따라서 일반적인 메인 스레드
지터를 AudioWorklet이 새로 해결하는 범위는 작고, 현재 측정에서는 전체 오디오
경로를 이중 구현할 비용을 정당화할 회귀가 확인되지 않았다.

## 현재 경로 기준선

### 자동 검증으로 확인된 타이밍 특성

| 항목 | 현재 수치/결과 | 근거 |
| --- | --- | --- |
| 장시간 엔진 드리프트 | 137 BPM, 7박, 10,000마디 rollover 후 산술 드리프트 0 ms | `tests/metronome-engine-timing.test.ts` |
| 프리렌더 JS stall 대응 | 가청 루프는 `AudioContext.currentTime`을 기준으로 계속 재생; UI는 40 ms 이상 차이에서 재동기화 | `lib/audio-clock.ts`, `docs/audio-clock-sync.md` |
| 실시간 fallback 예약폭 | 160 ms | `MetronomeEngine.REALTIME_LOOKAHEAD_MS` |
| fallback stall 대응 | 이미 예약된 클릭의 절대 오디오 시각은 JS stall 후에도 바뀌지 않음 | `tests/metronome-engine-timing.test.ts` |
| watchdog | 출력 상태를 약 3.5초 간격으로 검사하고, 무음이면 기존 per-tick 경로로 복구 | `hooks/useAudioPipeline.ts` |

프리렌더 모드의 가청 출력에는 마디마다 실행되는 JS 타이머가 없다. 활성 그래프는
일반적으로 buffer source + gain(필요하면 panner)이며, 루프 교체도 다음
오디오-buffer 경계 시각을 미리 예약한다. 따라서 160 ms보다 긴 stall은
**프리렌더 루프가 아니라 기본 Beat 모드의 실시간 fallback**에만 남는 실패 모드다.

### 현재 mixer CPU·메모리 기준선

다음 명령은 실제 `renderMeasure`를 4/4, 300 BPM, 16 subdivision, note sample 2개,
stereo routing 조건으로 200회 실행한다.

```sh
npx tsx --require ./tests/_stubs/setup.cjs scripts/benchmark-audio-renderer.ts
```

2026-09-03 Replit Linux/Node 22 실행 결과:

| 항목 | 결과 |
| --- | ---: |
| 1초 마디 1회 렌더 평균 | 1.17–1.42 ms |
| 1초 real-time budget 사용량 | 0.117–0.142% |
| stereo 2-copy 출력 크기 | 705,600 bytes (약 0.67 MiB) |
| 200회 후 ArrayBuffer 증가(강제 GC 없음) | 20.27–23.28 MiB |
| 200회 후 RSS 증가(강제 GC 없음) | 37.94–38.18 MiB |

메모리 증가는 200개 결과를 유지한 값이 아니라 V8/ArrayBuffer allocator가 회수 전
보유한 일시적인 high-water mark다. 제품에서는 새 루프가 활성화되면 이전 source와
URL을 정리한다. 그래도 저사양 모바일에서 마디 변경을 빠르게 반복할 때는 별도
실기기 메모리 프로파일이 필요하다.

## AudioWorklet 지원·배포 제약

### 브라우저

- MDN은 AudioWorklet을 2021년 4월부터 주요 브라우저에서 널리 제공되는 기능으로
  분류한다.
- 2026-09-03 Can I Use 표 기준 지원 시작점은 Chromium 66, Firefox 76,
  Safari 14.1, iOS Safari 14.5이며 전 세계 지원률은 약 95.6%다.
- AudioWorklet은 secure context가 필요하다. production HTTPS와 localhost는
  가능하지만 일반 HTTP 호스트에서는 `audioWorklet`이 없을 수 있다.
- AudioWorklet 자체에는 cross-origin isolation이 필수는 아니다. 그러나 PCM을
  `SharedArrayBuffer` ring buffer로 zero-copy 공유하려면 COOP/COEP와
  `crossOriginIsolated`가 필요하다. 현재 PulFors 배포는 이를 전제로 하지 않는다.
- iOS Safari는 background에서 AudioContext를 중단할 수 있다. Worklet은 OS의
  background/audio-session 정책을 우회하지 못하므로 기존 resume/watchdog가
  여전히 필요하다.

참고:

- <https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet>
- <https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode>
- <https://caniuse.com/wf-audio-worklet>

### Expo SDK 54 / Metro

`audioWorklet.addModule()`은 앱의 Metro bundle 안 함수를 받을 수 없고, 독립된
same-origin JavaScript module URL이 필요하다. 현재 `metro.config.js`에는 별도
worklet entry를 만드는 설정이 없다.

검증한 최소 배포 방식은 다음과 같다.

1. import 없는 plain JavaScript processor를 `public/audio-worklets/`에 둔다.
2. Expo web export가 이를 같은 경로로 정적 복사한다.
3. HTTPS에서
   `context.audioWorklet.addModule("/audio-worklets/pulfors-deployment-probe.js")`
   로 로드한다.

`public/audio-worklets/pulfors-deployment-probe.js`는 이 경로만 검증하는 무음
processor이며 앱에서는 로드하지 않는다. `npx expo export --platform web` 결과에
파일이 복사되고, 정적 결과를 제공한 Chromium에서 `addModule()`과
`AudioWorkletNode` 생성이 성공하는지 확인한다.

PCM이나 사용자 sample URI를 processor가 직접 fetch하게 만들지 않는다. 기존
allowlist/decoder를 메인 스레드에 유지하고, decode가 끝난 `Float32Array`만
transferable로 1회 전달해야 현재 보안 경계를 보존할 수 있다.

## 제한 프로토타입과 비교

파일:

- `docs/audio-worklet-metronome-processor.js`: sample/event mixer protocol prototype
- `docs/audio-worklet-benchmark.html`: 160 ms look-ahead와 worklet-owned clock 비교
- `docs/audio-worklet-scheduling-probe.js`: benchmark processor

Chromium 151 headless, localhost secure context에서 320 ms main-thread busy stall을
넣은 결과:

| 항목 | 결과 |
| --- | ---: |
| AudioWorklet 지원 / module load | 성공 |
| worklet 내부 50 ms pulse | 2.8초 동안 56/56 처리 |
| stall 동안 processor 중단 | 관찰되지 않음 |
| main-thread report | stall 뒤 누적 상태로 전달 |

headless Chromium의 AudioContext clock은 실제 오디오 장치와 달리 throttle될 수
있어 look-ahead의 audible miss 수는 기준선으로 사용하지 않았다. 이 부분은
`tests/metronome-engine-timing.test.ts`의 가짜 오디오 시계 테스트와 실제 브라우저
청취로 판단한다. 프로토타입은 **Worklet이 160 ms보다 긴 main-thread stall에도
자체 clock을 계속 진행할 수 있음**만 확인한다.

### 최소 메시지 프로토콜

| 메시지 | 필드 | 소유권/목적 |
| --- | --- | --- |
| `init` | `masterGain`, protocol version, channel count | processor 생성 직후 1회 |
| `sample` | `id`, mono/stereo PCM, sample rate | main decode 후 transferable로 1회 등록 |
| `schedule` | absolute `frame`, `sampleId`, `gain`, `channel`, `role`, `subdivision` | 강세·세분화가 확정된 event만 전달 |
| `set-volume` | `value`, optional ramp frame | 전체 볼륨 변경; PCM 재전송 없음 |
| `clear` | generation | schedule 변경/BPM 변경 때 이전 event·voice 제거 |
| `stop` | generation | 즉시 무음, sample cache는 유지 |
| `dispose` | generation | node/port/sample cache 완전 해제 |

`role`과 `subdivision`은 디버깅과 향후 sample 선택에 필요하지만 processor는 박자
규칙을 재해석하지 않는다. 박자·repeat·jump의 source of truth는 계속
`MetronomeEngine`이어야 한다. 모든 command에는 실제 도입 시 generation을 넣어
오래된 main-thread 메시지가 새 재생 세션을 되살리지 못하게 한다.

### lifecycle

1. 사용자 gesture에서 AudioContext를 resume한다.
2. capability + secure context를 확인하고 module을 1회 load한다.
3. node를 만들고 sample PCM을 등록한다.
4. 다음 마디의 absolute frame schedule을 보낸 뒤 출력에 연결한다.
5. sample/BPM 변경 시 새 generation으로 `clear` 후 다음 경계 schedule을 보낸다.
6. interruption에서는 `stop`; resume 실패나 processor error에서는 즉시 기존
   pre-render/look-ahead 경로를 사용한다.
7. unmount/context close에서 `dispose`, port close, node disconnect를 수행한다.

## 비교와 결정

| 기준 | 현재 프리렌더 + look-ahead | AudioWorklet 후보 |
| --- | --- | --- |
| 기본 장시간 드리프트 | absolute anchor와 audio clock 사용, 자동 테스트 0 ms | audio frame clock으로 안정적 |
| 프리렌더의 JS stall | 이미 영향 없음 | 개선 없음 |
| fallback의 160 ms 초과 stall | 이후 event 예약이 늦을 수 있음 | schedule을 미리 넘기면 개선 가능 |
| 렌더 CPU | 대표 마디 1.415 ms | 128-frame callback이 지속 실행; 실기기 수치 미확정 |
| 활성 메모리 | 대표 stereo 루프 약 0.67 MiB | sample cache + event/voice queue; SharedArrayBuffer 없으면 복사 필요 |
| sample/볼륨/channel | 현재 한 renderer에서 지원 | 동일 semantics를 별도 재구현해야 함 |
| browser/deploy | 기존 Web Audio 범위 | secure context + 별도 module URL + feature fallback 필요 |
| stop/recovery | generation, abort, watchdog 검증됨 | processor error/port/lifecycle 경로 추가 필요 |

**보류 근거**

1. 가장 복잡한 Bar/custom 경로는 이미 audio-thread buffer loop라 Worklet의 핵심
   이득이 겹친다.
2. 현재 renderer 비용은 대표 1초 마디의 0.15% 미만이고, 장시간 anchor drift는
   자동 테스트에서 0 ms다.
3. 확인된 이득은 기본 Beat fallback에서 160 ms를 넘는 main-thread stall 하나다.
   이를 위해 sample/channel/repeat/lifecycle을 두 경로에 유지하는 비용이 크다.
4. AudioWorklet도 Safari background suspension과 AudioContext 복구 문제를
   해결하지 않으므로 기존 lifecycle 코드는 제거할 수 없다.

## 재검토 조건

다음 중 하나가 실제 데이터로 확인될 때만 단계적 도입을 다시 검토한다.

- 지원 브라우저에서 160 ms보다 긴 stall 때문에 기본 Beat 클릭이 반복적으로 누락됨
- 렌더 변경 시 CPU peak 또는 ArrayBuffer high-water가 저사양 기기에서 사용자
  체감 끊김을 만듦
- 현재 `AudioBufferSourceNode` 수/graph churn이 장시간 세션에서 누수로 확인됨
- Worklet 경로가 iOS Safari와 Android Chromium에서 기존 대비 유의미하게 낮은
  underrun을 보이면서 배터리/CPU 회귀가 없음

그때도 먼저 built-in Beat mode만 feature flag 뒤에서 전환한다. Bar/custom,
native, export 경로는 기존 구현을 유지하고, processor error나 module load 실패는
항상 즉시 기존 look-ahead로 돌아가야 한다.