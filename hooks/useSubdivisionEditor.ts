import { useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { BeatStaffCellRects } from "@/lib/beat-staff-logic";

/**
 * Shared interaction state for the subdivision editor.
 *
 * The orchestration hook remains the single owner of the editing callbacks.
 * This hook only owns the transient drag/layout state consumed by those
 * callbacks, avoiding two competing implementations of the same gesture.
 */
export interface UseSubdivisionEditorParams {
  barAreaRef: MutableRefObject<any>;
  dialRef: MutableRefObject<any>;
  beatStaffCellRectsRef: MutableRefObject<BeatStaffCellRects>;
}

export function useSubdivisionEditor({
  barAreaRef,
  dialRef,
  beatStaffCellRectsRef,
}: UseSubdivisionEditorParams) {
  const barAreaLayoutRef = useRef({ y: 0, height: 0 });
  const dialCenterRef = useRef({ x: 0, y: 0 });
  const barScrollOffsetRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragPattern, setDragPattern] = useState<any[] | null>(null);
  const [dropTargetBeat, setDropTargetBeat] = useState<number | null>(null);
  const dragModeRef = useRef<"bar" | "beat" | null>(null);
  const dragPatternRef = useRef<any[] | null>(null);
  const dropTargetBeatRef = useRef<number | null>(null);

  return {
    barAreaRef,
    dialRef,
    beatStaffCellRectsRef,
    barAreaLayoutRef,
    dialCenterRef,
    barScrollOffsetRef,
    isDragging,
    setIsDragging,
    dragPos,
    setDragPos,
    dragPattern,
    setDragPattern,
    dropTargetBeat,
    setDropTargetBeat,
    dragModeRef,
    dragPatternRef,
    dropTargetBeatRef,
  };
}