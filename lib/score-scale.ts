// ============================================================
// 악보 크기 자동 조절 — 화면 너비 기반 LINE_SPACING 선택
// ============================================================
import { useWindowDimensions } from "react-native";

// score-layout.ts의 LINE_SPACING 상수와 동일한 기준값
export const BASE_LINE_SPACING = 10;

/**
 * 화면 너비에 따라 적절한 line spacing(px)을 반환합니다.
 * ScoreRenderer / ScoreCanvas에 prop으로 전달하면 악보가 화면에 맞게 확대됩니다.
 *
 * 너비 breakpoint → lineSpacing → SVG scale factor:
 *   ≤375px  → 10 (scale 1.0)   iPhone SE / 작은 폰
 *   ≤480px  → 11 (scale 1.1)   일반 폰
 *   <768px  → 12 (scale 1.2)   큰 폰 / 작은 태블릿
 *   ≥768px  → 13 (scale 1.3)   태블릿 / 웹 넓은 화면
 */
export function useScoreLineSpacing(): number {
  const { width } = useWindowDimensions();
  if (width <= 375) return 10;
  if (width <= 480) return 11;
  if (width < 768) return 12;
  return 13;
}

/**
 * lineSpacing → SVG 스케일 팩터 (= lineSpacing / BASE_LINE_SPACING)
 * score-layout.ts 함수들은 BASE_LINE_SPACING(10) 기반 좌표를 반환하므로
 * 이 값으로 viewBox를 조정하면 모든 요소가 균일하게 확대됩니다.
 */
export function scoreScaleFactor(lineSpacing: number): number {
  return lineSpacing / BASE_LINE_SPACING;
}
