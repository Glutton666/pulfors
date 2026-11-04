import React from "react";
import Svg, { G, Path, Text as SvgText } from "react-native-svg";
import type { NotebookTupletSpan } from "@/lib/notebook-tuplet-layout";

type Props = Pick<NotebookTupletSpan, "left" | "right" | "y" | "count"> &
  Partial<Pick<NotebookTupletSpan, "fontSize" | "below" | "continuedLeft" | "continuedRight" | "open">>;

/** Conventional tuplet: short inward hooks, two strokes and an unboxed numeral.
 * Leaving a real gap preserves staff lines and handwritten objects behind it. */
export function NotebookTupletGlyph({
  left, right, y, count, fontSize = 14, below = false,
  continuedLeft = false, continuedRight = false, open = false,
}: Props) {
  const middle = (left + right) / 2;
  const halfGap = count > 0 ? (String(count).length * fontSize * 0.65 + 8) / 2 : 0;
  const tick = (below ? -1 : 1) * 6;
  const start = continuedLeft ? `M${left} ${y}` : `M${left} ${y + tick} V${y}`;
  const end = continuedRight || open ? "" : ` V${y + tick}`;
  return <G testID={open ? "notebook-open-tuplet" : "notebook-tuplet-bracket"} opacity={open ? 0.55 : 1}>
    <Path testID="notebook-tuplet-left" d={`${start} H${middle - halfGap}`} stroke="#111" strokeWidth={1.2} fill="none" strokeLinejoin="miter" />
    <Path testID="notebook-tuplet-right" d={`M${middle + halfGap} ${y} H${right}${end}`} stroke="#111" strokeWidth={1.2} fill="none" strokeLinejoin="miter" />
    {count > 0 && <SvgText testID="notebook-tuplet-number" x={middle} y={y + fontSize * 0.34} textAnchor="middle"
      fontFamily="serif" fontStyle="italic" fontWeight="500" fontSize={fontSize} fill="#111">{count}</SvgText>}
  </G>;
}

export function NotebookTupletPreview({ count = 3 }: { count?: number }) {
  return <Svg width={48} height={28} viewBox="0 0 70 36">
    <NotebookTupletGlyph left={5} right={65} y={15} count={count} fontSize={17} />
  </Svg>;
}
