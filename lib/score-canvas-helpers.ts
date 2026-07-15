/**
 * score-canvas-helpers.ts
 *
 * ScoreCanvas PanResponder 핸들러에서 추출한 순수 로직 헬퍼.
 * 순수 함수로 분리함으로써 React Native 컴포넌트를 렌더링하지 않고도 테스트할 수 있습니다.
 */

/**
 * 음표 입력(release) 시 미리 듣기를 발동시킬지 결정합니다.
 *
 * ScoreCanvas PanResponder의 onPanResponderRelease 분기:
 *   if (!isPlayingRef.current) { previewFn(midi, instrumentId); }
 *
 * @param isPlaying    - 현재 재생 중이면 true (미리 듣기를 억제)
 * @param midi         - 발음할 MIDI 번호
 * @param previewFn    - 발음 함수 (기본값: previewScoreNote)
 * @param instrumentId - 현재 선택된 악기 ID (음색 결정에 사용)
 */
export function applyNotePreviewOnRelease(
  isPlaying: boolean,
  midi: number,
  previewFn: (m: number, instrumentId?: string) => void,
  instrumentId?: string,
): void {
  if (!isPlaying) {
    previewFn(midi, instrumentId);
  }
}
