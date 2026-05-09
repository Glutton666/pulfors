#!/usr/bin/env bash
# =============================================================================
# android-phone-call-e2e.sh
#
# Android 에뮬레이터에서 GSM 전화 수신을 시뮬레이션해 PulFors 메트로놈의
# 오디오 포커스 손실/회복 → 자동 재개 흐름을 자동으로 검증한다.
#
# 사전 조건:
#   - Android 에뮬레이터가 이미 실행 중이어야 한다 (`adb devices` 로 확인)
#   - PulFors Debug APK가 에뮬레이터에 설치돼 있어야 한다
#   - adb가 PATH에 있어야 한다
#
# 사용법:
#   bash scripts/android-phone-call-e2e.sh
#
# 종료 코드:
#   0 — 모든 시나리오 PASS
#   1 — 하나 이상의 시나리오 FAIL 또는 환경 오류
# =============================================================================
set -euo pipefail

# ── 상수 ─────────────────────────────────────────────────────────────────────
readonly PKG="com.pulfors.app"
readonly PHONE="5551234567"
readonly LOG="/tmp/pulfors-e2e-focus.log"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly DOC="$SCRIPT_DIR/../docs/android-audio-focus-verification.md"

# 에뮬레이터 시리얼 (복수 기기 환경 대응; 없으면 기본값)
ADB="${ADB_SERIAL:+adb -s $ADB_SERIAL}"
ADB="${ADB:-adb}"

TIMESTAMP=$(date -u "+%Y-%m-%d %H:%M UTC")
API_LEVEL=$($ADB shell getprop ro.build.version.sdk 2>/dev/null | tr -d '\r' || echo "?")
DEVICE=$($ADB shell getprop ro.product.model 2>/dev/null | tr -d '\r' || echo "emulator")

pass_count=0
fail_count=0
all_pass=true

declare -A RESULT    # RESULT[A]="PASS" 또는 "FAIL"
declare -A SCENARIO_LOG  # SCENARIO_LOG[A]="관찰된 로그 발췌"

# ── 유틸리티 ──────────────────────────────────────────────────────────────────

log() { echo "[E2E] $*"; }
die() { echo "[E2E] ERROR: $*" >&2; exit 1; }

# logcat 파일의 현재 줄 수를 반환한다.
logcat_offset() { wc -l < "$LOG" 2>/dev/null || echo 0; }

# 특정 오프셋 이후의 logcat 에서 패턴을 찾는다. 타임아웃(초) 내 발견 시 0 반환.
wait_for_pattern() {
  local pattern="$1"
  local timeout="${2:-15}"
  local offset="${3:-0}"
  local elapsed=0

  while (( elapsed < timeout )); do
    if tail -n +"$((offset + 1))" "$LOG" 2>/dev/null | grep -qF "$pattern"; then
      return 0
    fi
    sleep 1
    (( elapsed++ )) || true
  done
  return 1
}

# ── 환경 확인 ─────────────────────────────────────────────────────────────────

log "Android 오디오 포커스 E2E 테스트 시작"
log "타임스탬프: $TIMESTAMP"
log "기기 모델:  $DEVICE"
log "Android API: $API_LEVEL"
log "패키지:     $PKG"
echo ""

command -v adb >/dev/null 2>&1 || die "adb 를 찾을 수 없습니다. Android SDK 가 설치되어 있는지 확인하세요."

# 에뮬레이터 연결 확인
DEVICES=$($ADB devices | grep -v "List of" | grep -c "emulator\|device" || echo 0)
(( DEVICES > 0 )) || die "연결된 Android 기기/에뮬레이터가 없습니다. 에뮬레이터를 먼저 시작하세요."

# ── logcat 시작 ───────────────────────────────────────────────────────────────

$ADB logcat -c 2>/dev/null || true
$ADB logcat -v time "ReactNativeJS:D" "*:S" > "$LOG" 2>&1 &
LOGCAT_PID=$!
trap 'kill "$LOGCAT_PID" 2>/dev/null || true' EXIT INT TERM

log "logcat 모니터링 시작 (PID: $LOGCAT_PID) → $LOG"
sleep 1

# ── 앱 시작 및 메트로놈 재생 ─────────────────────────────────────────────────

log "앱 강제 종료 후 재시작..."
$ADB shell am force-stop "$PKG" 2>/dev/null || true
sleep 1

$ADB shell am start -n "$PKG/.MainActivity" > /dev/null
sleep 4

log "메트로놈 재생 딥링크 전송 (pulfors://play)..."
$ADB shell am start \
  -a android.intent.action.VIEW \
  -d "pulfors://play" \
  "$PKG" > /dev/null 2>&1 || true
sleep 3

PROBE_OFFSET=$(logcat_offset)
if wait_for_pattern "expo-av focus probe started" 15 0; then
  log "✓ 오디오 포커스 프로브 시작 확인"
else
  log "⚠  프로브 시작 로그 미감지 — 딥링크 자동 재생이 지원되지 않을 수 있음"
  log "   (메트로놈 재생 없이도 시나리오를 진행합니다)"
fi

# ── 시나리오 A: 전화 수신 → 거절 ─────────────────────────────────────────────
#
# 흐름: gsm call → (메트로놈 일시정지 기대) → gsm cancel → (자동 재개 기대)
# ─────────────────────────────────────────────────────────────────────────────

echo ""
log "═══════════════════════════════════════"
log " 시나리오 A: 전화 수신 → 거절"
log "═══════════════════════════════════════"

A_OFFSET=$(logcat_offset)

log "GSM 전화 수신 시뮬레이션..."
$ADB emu gsm call "$PHONE"
sleep 5

A_LOSS_OK=false
if wait_for_pattern "audio focus lost" 12 "$A_OFFSET"; then
  log "✓ [A] 포커스 손실 감지 → 메트로놈 일시정지"
  A_LOSS_OK=true
else
  log "✗ [A] 포커스 손실 미감지 (타임아웃)"
fi

log "GSM 전화 거절..."
$ADB emu gsm cancel "$PHONE"
sleep 6

A_GAIN_OK=false
if wait_for_pattern "audio focus regained" 15 "$A_OFFSET"; then
  log "✓ [A] 포커스 회복 감지 → 메트로놈 자동 재개"
  A_GAIN_OK=true
else
  log "✗ [A] 포커스 회복 미감지 (타임아웃)"
fi

A_LOG=$(tail -n +"$((A_OFFSET + 1))" "$LOG" | grep -E "androidFocus" | head -10 || true)

if $A_LOSS_OK && $A_GAIN_OK; then
  RESULT[A]="PASS"
  log "시나리오 A: PASS"
  (( pass_count++ )) || true
else
  RESULT[A]="FAIL"
  log "시나리오 A: FAIL"
  (( fail_count++ )) || true
  all_pass=false
fi
SCENARIO_LOG[A]="$A_LOG"

# ── 시나리오 B: 전화 수신 → 수락 → 통화 종료 ─────────────────────────────────
#
# 흐름: gsm call → gsm accept → (일시정지 기대) → gsm cancel → (자동 재개 기대)
# ─────────────────────────────────────────────────────────────────────────────

echo ""
log "═══════════════════════════════════════"
log " 시나리오 B: 전화 수신 → 수락 → 통화 종료"
log "═══════════════════════════════════════"

B_OFFSET=$(logcat_offset)

log "GSM 전화 수신..."
$ADB emu gsm call "$PHONE"
sleep 3

log "GSM 전화 수락..."
$ADB emu gsm accept "$PHONE"
sleep 5

B_LOSS_OK=false
if wait_for_pattern "audio focus lost" 12 "$B_OFFSET"; then
  log "✓ [B] 포커스 손실 감지 → 메트로놈 일시정지"
  B_LOSS_OK=true
else
  log "✗ [B] 포커스 손실 미감지 (타임아웃)"
fi

log "GSM 통화 종료..."
$ADB emu gsm cancel "$PHONE"
sleep 6

B_GAIN_OK=false
if wait_for_pattern "audio focus regained" 15 "$B_OFFSET"; then
  log "✓ [B] 포커스 회복 감지 → 메트로놈 자동 재개"
  B_GAIN_OK=true
else
  log "✗ [B] 포커스 회복 미감지 (타임아웃)"
fi

B_LOG=$(tail -n +"$((B_OFFSET + 1))" "$LOG" | grep -E "androidFocus" | head -10 || true)

if $B_LOSS_OK && $B_GAIN_OK; then
  RESULT[B]="PASS"
  log "시나리오 B: PASS"
  (( pass_count++ )) || true
else
  RESULT[B]="FAIL"
  log "시나리오 B: FAIL"
  (( fail_count++ )) || true
  all_pass=false
fi
SCENARIO_LOG[B]="$B_LOG"

# ── 시나리오 C: 다회 사이클 (3회 반복) ───────────────────────────────────────
#
# 전화 수신/거절을 3회 반복해 누적 상태 오류가 없는지 검증한다.
# ─────────────────────────────────────────────────────────────────────────────

echo ""
log "═══════════════════════════════════════"
log " 시나리오 C: 전화 수신/거절 3회 반복"
log "═══════════════════════════════════════"

C_OFFSET=$(logcat_offset)
C_LOSS=0
C_GAIN=0
C_OK=true

for i in 1 2 3; do
  log "  사이클 $i/3..."
  CYCLE_OFFSET=$(logcat_offset)

  $ADB emu gsm call "$PHONE"
  sleep 4
  if wait_for_pattern "audio focus lost" 10 "$CYCLE_OFFSET"; then
    (( C_LOSS++ )) || true
    log "  ✓ 사이클 $i: 손실 감지"
  else
    log "  ✗ 사이클 $i: 손실 미감지"
    C_OK=false
  fi

  $ADB emu gsm cancel "$PHONE"
  sleep 5
  if wait_for_pattern "audio focus regained" 12 "$CYCLE_OFFSET"; then
    (( C_GAIN++ )) || true
    log "  ✓ 사이클 $i: 회복 감지"
  else
    log "  ✗ 사이클 $i: 회복 미감지"
    C_OK=false
  fi
done

C_LOG=$(tail -n +"$((C_OFFSET + 1))" "$LOG" | grep -E "androidFocus" | head -20 || true)

if $C_OK && (( C_LOSS == 3 && C_GAIN == 3 )); then
  RESULT[C]="PASS"
  log "시나리오 C: PASS (loss=$C_LOSS gain=$C_GAIN)"
  (( pass_count++ )) || true
else
  RESULT[C]="FAIL"
  log "시나리오 C: FAIL (loss=$C_LOSS/3 gain=$C_GAIN/3)"
  (( fail_count++ )) || true
  all_pass=false
fi
SCENARIO_LOG[C]="$C_LOG"

# ── 시나리오 D (수동 안내) ─────────────────────────────────────────────────────
# 통화 중 사용자 수동 정지 → 통화 종료 → 자동 재개 억제 시나리오는
# UI 자동화(Maestro 등)가 필요해 이 스크립트 범위 밖이다.
# docs/android-audio-focus-verification.md 의 체크리스트를 참고한다.

# ── 요약 출력 ─────────────────────────────────────────────────────────────────

echo ""
log "══════════════════════════════════════════════════"
log " E2E 테스트 요약"
log "══════════════════════════════════════════════════"
log " 시나리오 A (전화 거절)       : ${RESULT[A]}"
log " 시나리오 B (통화 수락/종료)   : ${RESULT[B]}"
log " 시나리오 C (3회 반복 사이클)  : ${RESULT[C]}"
log "──────────────────────────────────────────────────"
log " PASS: $pass_count  FAIL: $fail_count"
OVERALL=$( $all_pass && echo "PASS" || echo "FAIL" )
log " 전체: $OVERALL"
log "══════════════════════════════════════════════════"

# ── 검증 문서 자동 업데이트 ───────────────────────────────────────────────────

if [[ -f "$DOC" ]]; then
  log ""
  log "검증 문서 업데이트: $DOC"

  # Python 으로 마커 사이의 섹션을 교체한다.
  python3 - "$DOC" << PYEOF
import sys, re, datetime

doc_path = sys.argv[1]
with open(doc_path, "r", encoding="utf-8") as f:
    content = f.read()

# 신규 CI 결과 섹션을 생성한다.
new_section = """<!-- CI_RESULTS_START -->
## 계층 2-A: CI 자동화 테스트 결과 (Android 에뮬레이터)

| 항목 | 값 |
|------|-----|
| 실행 일시 | $TIMESTAMP |
| 기기 모델 | $DEVICE |
| Android API | $API_LEVEL |
| 시나리오 A (전화 수신/거절) | ${RESULT[A]} |
| 시나리오 B (통화 수락/종료) | ${RESULT[B]} |
| 시나리오 C (3회 반복 사이클) | ${RESULT[C]} |
| **전체 결과** | **$OVERALL** |

### 시나리오 A — 전화 수신 → 거절 로그 발췌

\`\`\`
${SCENARIO_LOG[A]:-로그 없음}
\`\`\`

### 시나리오 B — 전화 수락 후 종료 로그 발췌

\`\`\`
${SCENARIO_LOG[B]:-로그 없음}
\`\`\`

### 시나리오 C — 3회 반복 사이클 로그 발췌 (처음 20줄)

\`\`\`
${SCENARIO_LOG[C]:-로그 없음}
\`\`\`

> 이 섹션은 GitHub Actions 워크플로우(`android-audio-focus-e2e.yml`)가 자동 갱신합니다.
<!-- CI_RESULTS_END -->"""

# 기존 마커 구간을 교체하거나 첫 번째 계층 섹션 앞에 삽입한다.
pattern = r"<!-- CI_RESULTS_START -->.*?<!-- CI_RESULTS_END -->"
if re.search(pattern, content, re.DOTALL):
    updated = re.sub(pattern, new_section, content, flags=re.DOTALL)
else:
    # 마커가 없으면 "## 계층 1" 앞에 삽입
    updated = re.sub(
        r"(## 계층 1:)",
        new_section + "\n\n---\n\n\\1",
        content,
        count=1,
    )

with open(doc_path, "w", encoding="utf-8") as f:
    f.write(updated)

print("문서 업데이트 완료")
PYEOF

  log "검증 문서 업데이트 완료"
fi

# ── 종료 코드 ─────────────────────────────────────────────────────────────────

if $all_pass; then
  log "모든 시나리오 PASS — 종료 코드 0"
  exit 0
else
  log "일부 시나리오 FAIL — 종료 코드 1"
  exit 1
fi
