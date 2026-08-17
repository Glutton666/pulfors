import {
  relativeLuminance,
  contrastRatio,
  isLightColor,
  onAccentColor,
  onAccentShadow,
  accentGradientEdge,
  withAlpha,
} from "@/lib/color-contrast";
import { PRESET_COLORS, HUE_COLORS } from "@/constants/color-presets";

describe("color-contrast", () => {
  test("relativeLuminance: 흑/백/rgb 파싱", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1);
    expect(relativeLuminance("rgb(255, 255, 255)")).toBeCloseTo(1);
    expect(relativeLuminance("rgba(0,0,0,0.5)")).toBeCloseTo(0);
    // 파싱 불가 → 0 (어두움 취급, 흰 글자 유지)
    expect(relativeLuminance("transparent")).toBe(0);
  });

  test("contrastRatio: 흑백 최대 대비 21:1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#808080", "#808080")).toBeCloseTo(1);
  });

  test("어두운 accent 는 흰 전경", () => {
    for (const accent of ["#8B1A2B", "#7B2D8E", "#2563EB", "#000000"]) {
      expect(onAccentColor(accent)).toBe("#FFFFFF");
      expect(onAccentShadow(accent)).toBe("rgba(0,0,0,0.6)");
      expect(accentGradientEdge(accent)).toBe("#FFFFFF");
    }
  });

  test("밝은 accent (gold 포함) 는 검정 전경", () => {
    // gold(#D4A846) 휘도 ≈ 0.42 — 흰 글자 대비는 2.2:1 뿐이라 검정을 써야 함
    for (const accent of ["#D4A846", "#F5F0E8", "#FFFFFF", "#39FF14"]) {
      expect(onAccentColor(accent)).toBe("#1A1A1A");
      expect(onAccentShadow(accent)).toBe("rgba(255,255,255,0.6)");
      expect(accentGradientEdge(accent)).toBe("rgba(0,0,0,0.55)");
    }
  });

  test("isLightColor 경계 — 흰색 vs #1A1A1A 대비 교차점", () => {
    expect(isLightColor("#000000")).toBe(false);
    expect(isLightColor("#FFFFFF")).toBe(true);
  });

  test("경계 근처 중간 회색에서도 항상 더 높은 대비 전경을 고른다", () => {
    for (const bg of ["#707070", "#777777", "#7A7A7A", "#808080", "#858585", "#8A8A8A"]) {
      const fg = onAccentColor(bg);
      const other = fg === "#FFFFFF" ? "#1A1A1A" : "#FFFFFF";
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(contrastRatio(other, bg));
    }
    // #777777: 흰색 대비(≈4.0)가 #1A1A1A 대비(≈3.7)보다 높아 흰색이어야 함
    expect(onAccentColor("#777777")).toBe("#FFFFFF");
  });

  describe("모든 프리셋 accent 에서 onAccentColor 는 반대색보다 대비가 높다", () => {
    test.each(PRESET_COLORS.map((p) => [p.value, p.color]))(
      "%s (%s)",
      (_name, color) => {
        const fg = onAccentColor(color as string);
        const other = fg === "#FFFFFF" ? "#1A1A1A" : "#FFFFFF";
        const ratio = contrastRatio(fg, color as string);
        expect(ratio).toBeGreaterThanOrEqual(contrastRatio(other, color as string));
        // 선택된 전경은 최소 WCAG AA(large/UI) 수준 이상
        expect(ratio).toBeGreaterThanOrEqual(3);
      }
    );
  });

  describe("대표 커스텀(휠) 색에서도 최적 전경 선택", () => {
    test.each(HUE_COLORS.map((c) => [c]))("%s", (color) => {
      const fg = onAccentColor(color as string);
      const other = fg === "#FFFFFF" ? "#1A1A1A" : "#FFFFFF";
      expect(contrastRatio(fg, color as string)).toBeGreaterThanOrEqual(
        contrastRatio(other, color as string)
      );
    });
  });

  test("withAlpha 변환", () => {
    expect(withAlpha("#FF0000", 0.25)).toBe("rgba(255,0,0,0.25)");
    expect(withAlpha("rgb(1, 2, 3)", 0.5)).toBe("rgba(1,2,3,0.5)");
    expect(withAlpha("weird", 0.5)).toBe("weird");
  });
});
