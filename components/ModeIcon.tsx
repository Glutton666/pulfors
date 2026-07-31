/**
 * 공유 모드 아이콘 컴포넌트 — ModeSwitcherDial 및 모드 레이블에서 공통 사용
 */
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import type { ModeSlot } from "@/components/ModeSwitcherDial";

export function ModeIcon({ mode, size, color }: { mode: ModeSlot; size: number; color: string }) {
  switch (mode) {
    case "beat":     return <Ionicons name="ellipse"       size={size} color={color} />;
    case "bar":      return <Ionicons name="reorder-three" size={size} color={color} />;
    case "score":    return <Ionicons name="musical-note"  size={size} color={color} />;
    case "note":     return <Ionicons name="list"          size={size} color={color} />;
    case "practice": return <Ionicons name="book-outline"  size={size} color={color} />;
    case "stage":    return <Ionicons name="mic-outline"   size={size} color={color} />;
    case "menu":     return <Ionicons name="menu"          size={size} color={color} />;
  }
}
