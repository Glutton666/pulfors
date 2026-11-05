import React, { useId } from "react";
import { Defs, G, Mask, Path, Rect } from "react-native-svg";
import type { StaffErasure } from "@/lib/staff-notebook";
import { inkPath } from "@/lib/notebook-erasing";

/** Real transparency, not white paint: staff lines and other objects survive. */
export function NotebookObjectMask({ cuts, children }: { cuts: StaffErasure[]; children: React.ReactNode }) {
  const key = `notebook-mask-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  if (!cuts.length) return <>{children}</>;
  return <>
    <Defs><Mask id={key} maskUnits="userSpaceOnUse" x={-10000} y={-10000} width={30000} height={60000}>
      <Rect x={-10000} y={-10000} width={30000} height={60000} fill="white" />
      {cuts.map((cut, i) => <Path key={i} d={inkPath(cut.points)} stroke="black" strokeWidth={cut.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}
    </Mask></Defs>
    <G mask={`url(#${key})`}>{children}</G>
  </>;
}
