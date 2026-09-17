# 오디오 파이프라인 재설계 기준선

이 문서는 오디오 파이프라인 마이그레이션의 현재 기준과 운영 규칙이다. 각 단계는 **새 구현 존재 → 실제 실행 경로 연결 → 대응 구 구현 제거**를 모두 증명하기 전 완료할 수 없다. 설명, 새 파일만 추가된 상태, 테스트 mock만 연결된 상태는 완료가 아니다.

## 1. 현재 실행 흐름

| 모드 | 계획·시작 | 스케줄 | 출력 | 정지·정리 |
|---|---|---|---|---|
| Beat | `usePlaybackControl`이 live ref를 읽어 엔진 구성과 render/realtime을 선택 | `MetronomeEngine` | web rendered loop 또는 realtime source, native rendered player | `usePlaybackControl`과 `useAudioPipeline`에 분산 |
| Bar | `usePlaybackControl`이 Bar config와 반복·레이어를 엔진에 적용 | `MetronomeEngine` schedule | Beat와 같은 출력에 layer PCM 추가 | Beat와 같은 분산 정리 |
| Note | Note 큐가 Beat/Bar 설정을 넘기고 공통 재생 제어를 호출 | 선택한 항목에 따라 공통 엔진 | 공통 파이프라인 | 큐 전환과 공통 stop이 함께 관여 |
| Score | `useScorePlayback`이 문서에서 timeline 생성 | `PlayEvent[]`와 RAF | `score-audio`의 음표·드럼 출력 | Score 훅이 prepare session, RAF, score notes 정리 |
| Polygon | `usePolygonMode`가 engine beat callback에 등록 | 레이어별 비율 계산과 `setTimeout` | web 직접 source 또는 native 공용 pool | Polygon 훅이 레이어 timer를 정리; player pool은 다른 훅 소유 |

Score와 Polygon은 재생 단위가 다르므로 하나의 선택적 필드 묶음으로 합치지 않는다. 향후 계획은 공통 헤더와 모드별 discriminated union으로 표현한다.

## 2. 현재 자원 소유권

| 자원 | 현재 생성·보관 | 현재 정리 | 확인된 중복·경계 |
|---|---|---|---|
| native rendered player | `useAudioPipeline`의 current/pending ref, 시작 중에는 `usePlaybackControl`의 local 변수 | 양쪽에서 조건부 release | detailed result와 local player가 같은 인스턴스를 서로 다른 규칙으로 추적 |
| builtin native pool | `useAudioPlayers` lazy cache | 훅 unmount | Polygon이 pool을 빌려 직접 재생 |
| note sample player | `useAudioPipeline` | 개별·전체 release 함수 | preload generation과 playback epoch가 별도 |
| web rendered loop | `useAudioPipeline` ref, `usePlaybackControl`이 생성·교체 호출 | 양쪽 stop 경로 | 생성·활성화·이전 loop 정지가 분리 |
| realtime web source | 공통 파이프라인 set, Polygon은 별도 직접 생성 | 공통 set 또는 Polygon onended | 같은 AudioContext지만 소유·활동 보고 규칙이 다름 |
| rendered URL | `useAudioPipeline` ref | build 실패, 교체, stop에서 revoke | player handoff와 URL 수명이 서로 다른 분기 |
| render task | 공유 generation ref와 abort-controller map | 여러 cleanup과 새 render 시작 | ready/aborted/failed 해석이 호출자별로 다름 |
| Polygon timer | `usePolygonMode` layer별 set | stop, BPM·meter 변경, edit/delete | engine callback과 React effect가 함께 수명 결정 |
| Score prepare/RAF | `useScorePlayback` session ref와 RAF ref | pause, stop, doc change, unmount | 공통 metronome 세션과 별도 모델 |
| PCM cache | click cache, sample key cache, URI cache, Polygon cache | 각 훅의 invalidate/cleanup | 같은 소스가 여러 캐시 정책을 가질 수 있음 |
| watchdog timer | `useAudioPipeline` | stop·rearm·unmount | 모든 출력 경로가 activity를 보고해야 함 |

마이그레이션 단계에서는 한 행의 변경 후 소유자가 반드시 하나여야 한다. 구 소유자와 새 소유자가 동시에 `release`, `stop`, `cancel`, `revoke`를 호출할 수 있으면 단계 실패다.

## 3. 결과 상태 계약

| 결과 | 의미 | UI | 재시도·fallback | 필수 정리 |
|---|---|---|---|---|
| `completed` | 준비와 첫 실제 출력이 현재 세션에 반영됨 | playing | 없음 | 이전 세션만 정리 |
| `cancelled` | 사용자가 현재 시작·재생을 중단함 | stopped | 없음 | 현재 준비물과 예약 모두 폐기 |
| `superseded` | 더 새로운 generation이 결과를 대체함 | 최신 세션 상태 유지 | 없음 | 오래된 결과만 폐기; 사용자 오류 금지 |
| `failed` | 현재 작업이 실제 오류로 완료되지 못함 | stopped 또는 recovering | 명시된 정책만 수행 | 부분 생성 자원 전부 폐기 |
| `first-output-failed` | 준비는 성공했지만 제한 시간 안에 출력 활동이 없음 | recovering/failed | watchdog 정책 | 무음 세션과 예약 자원 정리 |

`cancelled`와 `superseded`는 오류 알림이나 실패 로그를 만들지 않는다. `failed`를 취소처럼 삼켜서도 안 된다. 모든 비동기 완료는 세션 ID와 generation 소유권을 확인한 뒤 상태·자원을 게시한다.

## 4. 기준 측정

### 자동 기준

```bash
npm run typecheck
npm run audio:benchmark
npx jest --runInBand \
  tests/audio-clock.test.ts \
  tests/audio-renderer-core.test.ts \
  tests/audio-renderer-layers.test.ts \
  tests/audio-renderer-export-abort.test.ts \
  tests/audio-renderer-bpm-lock.test.ts \
  tests/prerender-playback-reliability.test.ts \
  tests/score-playback-hook.test.ts
```

`audio:benchmark`는 동일한 4/4·16 subdivision·2 sample stereo measure를 반복 렌더하여 iteration당 wall time, realtime budget 비율, 출력 bytes, heap/ArrayBuffer/RSS 전후를 JSON으로 출력한다. 향후 단계는 같은 기기·iteration 수로 전후 값을 보관한다.

### 실제 출력 기준

각 플랫폼에서 다음을 동일한 진단 세션으로 기록한다.

- 사용자 입력부터 첫 audio activity까지의 시간
- render 시작부터 ready/aborted/failed까지의 시간과 횟수
- decode 요청·cache hit·실제 decode 횟수
- 생성, publish, stop, release된 native player 수
- 생성, start, cancel, ended된 web source 수
- 생성·revoke된 임시 URL 수
- 세션 종료 직후 남은 timer/source/player/URL 수

종료 후 남은 소유 자원 수는 0이어야 한다. 장기 캐시는 별도 소유자로 집계하고 세션 자원에 포함하지 않는다.

## 5. 단계별 보호 구역

| 단계 | 보호 파일 | 병행 시 조율할 변경 |
|---|---|---|
| Playback plan | `usePlaybackControl`, `useAudioPipeline`, `useMetronomeScreen`, 모드 playback 훅 | 시작 조건, 설정 snapshot, render/realtime 선택 |
| Render lifecycle | `useAudioPipeline`, `usePlaybackControl`, `audio-renderer`, `audio-clock` | generation, abort, detailed result, pending player |
| Output ownership | 위 파일과 `useAudioPlayers`, `usePolygonMode` | player/source/loop/URL 생성·정지·release |
| Polygon scheduler | `usePolygonMode`, engine pure schedule | layer timing, offsets, timer cancellation |
| Tone snapshot | pipeline/control/polygon, renderer, tone DSP | tone·volume·boost 적용 시점 |
| PCM warmup | pipeline/players/polygon, renderer, sample cache | decode, preload, cache, warmup |

보호 파일을 수정하는 긴급 버그는 현재 단계에 합치거나, 단계를 중단하고 버그를 먼저 반영한 뒤 기준 커밋부터 다시 잡는다. 구·신 양쪽에 동일 패치를 복제한 채 다음 단계로 넘어가지 않는다.

## 6. 단계 완료 체크포인트

다음 순서를 모두 수행한다.

1. 보호 파일을 건드리는 진행·병합 대기 작업 확인
2. 최신 기준 반영 후 충돌 해결
3. `npm run audio:migration:verify -- <stage>` 실행
4. 계획된 새 파일이 실제 존재하는지 확인
5. production 호출자가 새 모듈을 import하고 결과를 사용하는지 확인
6. 대응되는 구 구현·ref·직접 resource 접근이 제거됐는지 확인
7. `git diff --check`
8. `git diff --stat`
9. `git status --short`
10. typecheck, 대상 테스트, benchmark와 실제 플랫폼 검증
11. 사용자가 diff와 Git 상태를 직접 확인

중간에 보호 파일의 새 변경이 병합되면 이전 검증은 무효다. 최신 코드에서 3번부터 다시 수행한다. 다음 단계는 사용자 확인 전 시작하지 않는다.

## 7. 완료 보고 형식

각 단계는 아래 증거를 함께 제공한다.

- 추가된 전용 모듈
- 실제 production 호출자
- 제거된 구 소유권·분기·ref
- 남아 있는 호환 경로와 제거 예정 단계
- 실행한 명령과 결과
- benchmark 전후
- `git diff --stat`과 `git status --short`

새 파일만 존재하거나, import만 되고 실행 결과가 사용되지 않거나, 구 구현이 fallback이라는 이름으로 항상 활성화돼 있으면 완료가 아니다.