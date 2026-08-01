#!/usr/bin/env bash
# expo-audio 최신 버전(latest/next 채널)에서 addInterruptionListener 노출 여부를 확인한다.
#
# 사용법:
#   bash scripts/check-expo-audio-api.sh
#
# 종료 코드:
#   0 — addInterruptionListener 미발견 (expo-av 프로브 폴백 계속 사용)
#   1 — addInterruptionListener 발견 → lib/android-audio-focus.ts 우선순위 1 활성화 가능
#   2 — 네트워크 오류 등 실행 실패
#
# CI 또는 개발자가 expo-audio 릴리스마다 수동 실행해 업그레이드 시점을 감지한다.
# API 발견 시 tests/android-audio-focus.test.ts 섹션 B "업그레이드 준비 체크리스트"를 따른다.

set -euo pipefail

echo "[expo-audio-api-check] 최신 버전 확인 중..."

LATEST=$(npm show expo-audio dist-tags.latest 2>/dev/null || { echo "[expo-audio-api-check] ERROR: npm show 실패"; exit 2; })
NEXT=$(npm show expo-audio dist-tags.next 2>/dev/null || echo "")

echo "[expo-audio-api-check] latest: $LATEST, next: ${NEXT:-없음}"

found=0

check_version() {
  local ver="$1"
  local label="$2"
  local tarball
  tarball=$(npm show "expo-audio@$ver" dist.tarball 2>/dev/null) || return 0

  local tmp
  tmp=$(mktemp -d)
  trap "rm -rf '$tmp'" RETURN

  # tarball 에서 타입 선언 파일만 추출해 addInterruptionListener 검색
  if curl -sL --max-time 30 "$tarball" | tar xz -C "$tmp" \
      --wildcards \
      'package/build/AudioModule.d.ts' \
      'package/build/AudioModule.types.d.ts' \
      'package/build/index.d.ts' 2>/dev/null; then
    if grep -q "addInterruptionListener" "$tmp"/package/build/*.d.ts 2>/dev/null; then
      echo "[expo-audio-api-check] ✓ addInterruptionListener 발견! expo-audio $ver ($label)"
      echo "  → lib/android-audio-focus.ts 우선순위 1 경로를 활성화할 수 있습니다."
      echo "  → tests/android-audio-focus.test.ts 섹션 B 업그레이드 준비 체크리스트를 따르세요."
      found=1
    else
      echo "[expo-audio-api-check] expo-audio $ver ($label): addInterruptionListener 미발견"
    fi
  else
    echo "[expo-audio-api-check] expo-audio $ver ($label): 타입 파일 추출 실패 (무시)"
  fi
}

check_version "$LATEST" "latest"
if [ -n "$NEXT" ] && [ "$NEXT" != "$LATEST" ]; then
  check_version "$NEXT" "next"
fi

if [ "$found" -eq 1 ]; then
  exit 1
else
  echo "[expo-audio-api-check] 업그레이드 대기 중 — expo-av 프로브 폴백 계속 사용."
  exit 0
fi
