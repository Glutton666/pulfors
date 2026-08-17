// 테마 accent 색 위에 올라가는 글리프/그라디언트의 대비 색을 자동 선택하는 유틸.
// accent 는 사용자가 13개 프리셋 + 임의 커스텀 hex 로 바꿀 수 있으므로
// "accent 는 진하고 채도 높다"는 가정(흰 글자·흰 그라디언트)이 밝은 색에서 깨진다.

/** hex(#RRGGBB) 또는 rgb()/rgba() 문자열 → 상대 휘도(0~1). 파싱 실패 시 0(어두움 취급). */
export function relativeLuminance(color: string): number {
  let r = 0, g = 0, b = 0;
  const hex = color.match(/^#([0-9a-f]{6})/i);
  const rgb = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (hex) {
    r = parseInt(hex[1].slice(0, 2), 16);
    g = parseInt(hex[1].slice(2, 4), 16);
    b = parseInt(hex[1].slice(4, 6), 16);
  } else if (rgb) {
    r = +rgb[1]; g = +rgb[2]; b = +rgb[3];
  }
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 대비 비율 (1~21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// 실제 사용하는 어두운 전경(#1A1A1A)의 휘도. 흰색(#FFFFFF)은 1.
const DARK_FG = "#1A1A1A";
const DARK_FG_L = relativeLuminance(DARK_FG);

// 흰색(#FFF)과 #1A1A1A 의 대비가 같아지는 배경 휘도 교차점:
// (1.05)/(L+0.05) = (L+0.05)/(DARK_FG_L+0.05) → L = sqrt(1.05*(DARK_FG_L+0.05)) - 0.05
const BW_CROSSOVER = Math.sqrt(1.05 * (DARK_FG_L + 0.05)) - 0.05;

/** 배경색이 밝으면 true — 어두운 전경(#1A1A1A)이 흰색보다 대비가 높은 영역. */
export function isLightColor(color: string): boolean {
  return relativeLuminance(color) > BW_CROSSOVER;
}

/** accent 위에 올릴 텍스트/글리프 색 — 흰색 vs #1A1A1A 중 실제 대비가 높은 쪽. */
export function onAccentColor(accent: string): string {
  return contrastRatio(DARK_FG, accent) >= contrastRatio("#FFFFFF", accent)
    ? DARK_FG
    : "#FFFFFF";
}

/** accent 위 글리프의 텍스트 그림자 색 — 글리프가 검정이면 밝은 halo, 흰색이면 어두운 halo. */
export function onAccentShadow(accent: string): string {
  return isLightColor(accent) ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)";
}

/** 스트롱 셀/도트 그라디언트의 하이라이트 엣지 색 — accent 와 반대 방향으로 대비. */
export function accentGradientEdge(accent: string): string {
  return isLightColor(accent) ? "rgba(0,0,0,0.55)" : "#FFFFFF";
}

/** hex/rgb 색을 주어진 알파의 rgba 문자열로 변환 (틴트·하이라이트용). */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.match(/^#([0-9a-f]{6})/i);
  const rgb = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (hex) {
    const r = parseInt(hex[1].slice(0, 2), 16);
    const g = parseInt(hex[1].slice(2, 4), 16);
    const b = parseInt(hex[1].slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (rgb) return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${alpha})`;
  return color;
}
