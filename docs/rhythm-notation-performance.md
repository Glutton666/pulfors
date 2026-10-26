# 긴 리듬 기록 계산 성능

## 범위

원본 down/up, 자동 시작·예비박, 마이크와 BPM 추정은 변경하지 않았다.
격자 점수·음가 의미·후보 순서도 바꾸지 않는다. 수동 이벤트·확정된
붙임줄은 기존 병합/보호 규칙을 그대로 거친다.

- 후보 메타데이터는 즉시 생성하되 `events`는 처음 읽을 때만 생성한다.
  같은 후보를 다시 읽으면 생성된 배열을 재사용한다.
- 대안은 해당 마디 주변의 입력과 그 마디를 가로지르는 **전체 지속음**을
  사용한다. 앞뒤의 붙임줄 조각과 원래 이벤트 순서도 포함한다.
- 지속음 길이의 격자 선택은 입력마다 한 번만 수행한다.
- 쉼표의 점유 구간·연음 힌트, 검증 후보·오류·확정 정보, 재생의 붙임줄
  조각은 먼저 색인한다. 마디마다 전체 문서를 반복 검색하지 않는다.
- 실시간 간격 표시에는 상위 화면에서 이미 계산한 검증 결과를 전달한다.
- 전역/문서 간 캐시는 없다. 삭제·BPM/박자/오프셋 변경·옛 기록 열기 때
  오래된 해석이 남을 수 있는 별도 무효화 경로를 만들지 않았다.

## 개발 환경 측정

2026-10-25, 이 작업 공간의 Node 22, 120 BPM, 250ms 간격에
`[0, 8, -4, 3]ms` 지터를 반복한 패드 입력. 두 번 예열 후 7회 중앙값.
동일한 기보 코드의 변경 전/후를 비교했다. 시간 제한을 둔 CI 검사는 아니다.

| 계산 항목 | 300타격 이전 → 이후 | 1000타격 이전 → 이후 |
|---|---:|---:|
| 자동 음표 + 후보 메타데이터 | 114.84 → 8.08ms | 1340.65 → 22.48ms |
| 모든 후보의 음표까지 실제 생성 | 110.62 → 16.51ms | 1210.17 → 45.66ms |
| `interpretRhythm` (쉼표/수동 병합 포함) | 112.17 → 8.04ms | 1234.25 → 14.25ms |
| 입력 추가 → 해석·검증·간격 피드백 계산 | 124.43 → 16.95ms | 1267.58 → 49.33ms |

별도 실행의 중앙값이므로 표의 항목끼리 합산하거나 차감하면 안 된다.
후보 전체 생성 행은 메타데이터 생성 비용도 포함한다. 실제 화면에서는 검증의
점수 기준에 해당하는 후보와 사용자가 연 후보만 음표를 생성한다.

### 실제 화면 컴포넌트의 입력 콜백 → DOM 반영

`RhythmWorkspace`, 실제 `RhythmStaff`/`RhythmLiveFeedback` 계산을 사용했다.
오디오·저장소·입력 표면은 테스트 대역이며, RN/SVG는 DOM 어댑터이다.
녹음 시작 때 긴 기록을 주입한 뒤 입력 콜백을 호출해 `act`의 DOM 반영까지
측정하고 실제 새 음표의 ellipse 개수가 증가했는지 확인한다.
릴리스도 별도로 실행한다. 9타격 중 앞 두 번을 제외한 7회:

| 기존 타격 수 | 중앙값 이전 → 이후 | 최댓값 이전 → 이후 |
|---|---:|---:|
| 300 | 495.84 → 162.02ms | 627.42 → 317.31ms |
| 1000 | 3250.65 → 704.89ms | 3844.93 → 724.49ms |

이 수치는 **개발용 React/jsdom DOM 반영 시간**이다. 브라우저 페인트, 실제
iPhone/Android 터치→표시 지연, 오디오 지연으로 해석하면 안 된다. 단위 계산과
화면 반영의 개선은 확인했지만 모든 길이/기기에서 무지연이라는 보장은 아니다.
특히 악보 전체의 SVG/입력 타깃 생성·렌더링 비용은 남아 있어 화면 밖 마디의
렌더링 제한은 별도 개선 대상으로 남긴다.

## 재현

```sh
npx tsx scripts/benchmark-rhythm.ts
RHYTHM_BENCHMARK=1 npx jest --runInBand --runTestsByPath tests/rhythm-input-benchmark.test.tsx
```

이전 버전과 비교하려면 `BASE_REF`에 최적화 전 Git 버전을 지정해 필요한
라이브러리만 별도 출력한다. 생성 파일은 이미 무시되는 디렉터리에 둔다.
앱 소스를 되돌릴 필요는 없다.

```sh
mkdir -p generated-artifacts/rhythm-baseline
for name in engine automatic spans notation score-timeline types verification timing-feedback; do
  git show "$BASE_REF:lib/rhythm-lab/$name.ts" > "generated-artifacts/rhythm-baseline/$name.ts"
done
RHYTHM_BASELINE_DIR="$PWD/generated-artifacts/rhythm-baseline" npx tsx scripts/benchmark-rhythm.ts
RHYTHM_BENCHMARK=1 RHYTHM_BASELINE_DIR="$PWD/generated-artifacts/rhythm-baseline" \
  npx jest --runInBand --runTestsByPath tests/rhythm-input-benchmark.test.tsx
```

성능 테스트는 기본 전체 테스트에서 의도적으로 건너뛴다. 별도의
`rhythm-performance.test.ts`는 항상 실행되어 이전 구현에서 캡처한 모든 후보/
검증 결과, 지터·역순 입력·7/8·독립 릴리스·화음·장음/붙임줄·꾸밈음,
300/1000타격 이후의 확정 보호, 후보의 지연 생성과 국소 입력 접근량을 검사한다.
시간 기준 대신 최근 후보가 과거 1000개 입력을 모두 읽지 않는지도 검사한다.

## 확인 결과

- TypeScript 전체 검사 통과.
- Jest 전체: 216개 스위트 통과. 선택 실행 성능 테스트 2개는
  별도 실행하여 변경 전/후 모두 통과.
- `rhythm-live-timing.test.ts`: Node 테스트 실행도 10개 통과.
- Chromium 실제 화면: 혼합 binary/triplet 표기와 독립 지속음·붙임줄 편집
  시나리오 2개 통과. 실제 악보 스크린샷 확인.
- 실제 휴대폰의 300/1000타격 입력 지연·프레임 누락·메모리는 미측정.
