/**
 * 디자인 토큰: spacing, radius, typography, elevation.
 *
 * 모든 새 컴포넌트는 하드코딩된 숫자 대신 이 토큰을 사용해야 합니다.
 * 기존 컴포넌트는 점진적으로 마이그레이션합니다.
 *
 * scale.ts 의 `useScaleValues()`(S.ms, S.s 등)와 함께 쓰일 때:
 *   `padding: S.s(Spacing.md)` 처럼 토큰 값을 디바이스 스케일로 한 번 더 보정합니다.
 *
 * 토큰 값은 unscaled — 컴포넌트 측에서 ScaleValues helpers 로 곱하세요.
 */

export const Spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const Radius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  pill: 999,
} as const;

export const FontSize = {
  micro: 10,
  caption: 11,
  small: 12,
  body: 14,
  bodyLg: 15,
  subtitle: 16,
  title: 18,
  h3: 20,
  h2: 24,
  h1: 28,
  display: 32,
  hero: 40,
} as const;

export const FontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const LineHeight = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
} as const;

export const BorderWidth = {
  thin: StyleSheetHairline(),
  thick: 1,
  emphasis: 2,
} as const;

function StyleSheetHairline(): number {
  // RN StyleSheet.hairlineWidth 는 import 경로 의존성이 있어 모듈 평가 시점에 1 로 안전 폴백.
  // 컴포넌트에서 더 정밀한 값이 필요하면 StyleSheet.hairlineWidth 를 직접 사용하세요.
  return 1;
}

export const Elevation = {
  none: { shadowOpacity: 0, elevation: 0 },
  low: { shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  mid: { shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  high: { shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
} as const;

export const Duration = {
  instant: 80,
  fast: 150,
  normal: 250,
  slow: 400,
  themeTransition: 220,
} as const;

export const Opacity = {
  disabled: 0.4,
  pressed: 0.7,
  overlay: 0.5,
  faint: 0.08,
  subtle: 0.15,
} as const;

export type SpacingKey = keyof typeof Spacing;
export type RadiusKey = keyof typeof Radius;
export type FontSizeKey = keyof typeof FontSize;

export default {
  Spacing,
  Radius,
  FontSize,
  FontWeight,
  LineHeight,
  BorderWidth,
  Elevation,
  Duration,
  Opacity,
};
