import React from "react";
import { Pressable, Text, View } from "react-native";
import type { RhythmDocument } from "@/lib/rhythm-lab/types";

export function RhythmStaffControls({ layout, onChange, ko }: {
  layout: RhythmDocument["staffLayout"]; onChange: (layout: NonNullable<RhythmDocument["staffLayout"]>) => void; ko: boolean;
}) {
  const base = layout ?? { barsPerRow: 2, rowOverrides: [] };
  return <View testID="rhythm-staff-controls" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingVertical: 5, paddingHorizontal: 4, backgroundColor: "#fff" }}>
    {(["notationZoom", "rowSpacing"] as const).map((key) => {
      const value = base[key] ?? 1, min = key === "notationZoom" ? 0.5 : 0.9;
      return <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        <Text style={{ fontSize: 11, color: "#383838" }}>{key === "notationZoom" ? (ko ? "음표 크기" : "Note size") : (ko ? "줄 간격" : "Row spacing")}</Text>
        {[-1, 1].map((direction) => <React.Fragment key={direction}>
          {direction === 1 && <Text testID={`rhythm-${key}-value`} style={{ color: "#222", fontSize: 11, minWidth: 34, textAlign: "center" }}>{Math.round(value * 100)}%</Text>}
          <Pressable testID={`rhythm-${key}-${direction < 0 ? "less" : "more"}`} accessibilityRole="button"
            accessibilityLabel={`${key === "notationZoom" ? (ko ? "음표 크기" : "Note size") : (ko ? "줄 간격" : "Row spacing")} ${direction < 0 ? "−" : "+"}`}
            disabled={direction < 0 ? value <= min : value >= 2}
            onPress={() => onChange({ ...base, [key]: Math.max(min, Math.min(2, Math.round((value + direction * 0.1) * 10) / 10)) })}
            style={{ minWidth: 30, minHeight: 30, borderWidth: 1, borderColor: "#ccc", borderRadius: 6, alignItems: "center", justifyContent: "center", opacity: (direction < 0 ? value <= min : value >= 2) ? 0.35 : 1 }}>
            <Text style={{ color: "#222", fontSize: 17 }}>{direction < 0 ? "−" : "+"}</Text>
          </Pressable>
        </React.Fragment>)}
      </View>;
    })}
  </View>;
}
