import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import type { BeatType } from "@/lib/metronome-engine";
import { candidateRadii } from "@/lib/circular-subdivision";

import type { CircularDraft } from "@/lib/circular-subdivision";

type Candidate = {
  type: BeatType;
  letter: string;
  shape: "square" | "accent" | "normal" | "mute";
};

const CANDIDATES: Candidate[] = [
  { type: "strong", letter: "S", shape: "square" },
  { type: "accent", letter: "A", shape: "accent" },
  { type: "normal", letter: "N", shape: "normal" },
  { type: "mute", letter: "M", shape: "mute" },
];

const letterForType: Record<BeatType, string> = {
  strong: "S",
  accent: "A",
  normal: "N",
  mute: "M",
};

function candidateForType(type: BeatType): Candidate {
  return CANDIDATES.find((candidate) => candidate.type === type) ?? CANDIDATES[2];
}

function markerStyle(shape: Candidate["shape"], diameter: number, color: string, filled: boolean) {
  const radius = diameter / 2;
  const base = {
    width: diameter,
    height: diameter,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
  if (shape === "square") {
    return {
      ...base,
      borderRadius: Math.max(2, diameter * 0.2),
      backgroundColor: filled ? color : "transparent",
      borderColor: color,
      borderWidth: filled ? 0 : 1.5,
      transform: [{ rotate: "45deg" as const }],
    };
  }
  if (shape === "accent") {
    return {
      ...base,
      borderRadius: radius,
      backgroundColor: filled ? color : "transparent",
      borderColor: color,
      borderWidth: filled ? 0 : 1.5,
    };
  }
  if (shape === "mute") {
    return {
      ...base,
      borderRadius: Math.max(2, diameter * 0.22),
      backgroundColor: "transparent",
      borderColor: color,
      borderWidth: 1.5,
      transform: [{ rotate: "45deg" as const }],
    };
  }
  return {
    ...base,
    borderRadius: radius,
    backgroundColor: filled ? color : "transparent",
    borderColor: color,
    borderWidth: filled ? 0 : 1.5,
  };
}

export function CircularSubdivisionOverlay({
  draft,
  size,
}: {
  draft: CircularDraft;
  size: number;
}) {
  const { colors: C } = useTheme();
  const dimension = Math.max(0, Math.min(size, draft.geometry.size));
  const center = dimension / 2;
  const dotRadius = Math.max(0, draft.geometry.radius);
  const radii = candidateRadii(dotRadius);
  const candidateTypes = CANDIDATES.slice(0, radii.length);
  const currentType = draft.notes[draft.notes.length - 1] ?? "normal";
  // The current note is represented only by its selectable candidates.
  // Drawing it twice makes an unselected menu candidate look like a saved note.
  const visibleNotes = draft.notes.slice(0, -1);
  const compact = dimension < 170;

  const dotDiameter = Math.max(8, Math.min(dimension * (compact ? 0.095 : 0.115), dotRadius * 2.3 || 12));
  const candidateDiameter = Math.max(8, Math.min(dotDiameter * (compact ? 1.08 : 1.15), 21));
  const maxOrbit = Math.max(0, center - candidateDiameter / 2 - 1);
  const pointFor = (angle: number, orbit: number, diameter: number) => {
    const boundedOrbit = Math.max(0, Math.min(orbit, center - diameter / 2 - 1));
    return {
      left: center + boundedOrbit * Math.cos(angle) - diameter / 2,
      top: center + boundedOrbit * Math.sin(angle) - diameter / 2,
    };
  };

  return (
    <View
      testID="circular-subdivision-draft"
      accessibilityLabel={draft.notes.map((type) => letterForType[type]).join("")}
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: dimension,
        height: dimension,
        overflow: "hidden",
      }}
    >
      {visibleNotes.map((type, index) => {
        const candidateIndex = CANDIDATES.findIndex((candidate) => candidate.type === type);
        const orbit = radii[candidateIndex] ?? radii[radii.length - 1] ?? 0;
        const angleIndex = index;
        const angle = draft.noteAngles[angleIndex] ?? draft.startAngle;
        const pos = pointFor(angle, Math.min(orbit, maxOrbit), dotDiameter);
        const candidate = candidateForType(type);
        const isCurrent = angleIndex === draft.notes.length - 1;
        const fill = type === "strong" || type === "accent";
        const color = type === "strong" ? C.accent : type === "accent" ? C.accentMuted : type === "mute" ? C.textSecondary : C.textTertiary;
        return (
          <View
            key={`note-${angleIndex}`}
            style={{
              position: "absolute",
              left: pos.left,
              top: pos.top,
              width: dotDiameter,
              height: dotDiameter,
              alignItems: "center",
              justifyContent: "center",
              opacity: isCurrent ? 0.82 : 0.68,
              zIndex: 1,
            }}
          >
            <View style={markerStyle(candidate.shape, dotDiameter, color, fill)} />
            {!compact && dotDiameter >= 15 ? (
              <Text
                allowFontScaling={false}
                style={{
                  position: "absolute",
                  color: type === "strong" || type === "accent" ? C.background : C.text,
                  fontSize: Math.max(7, dotDiameter * 0.43),
                  lineHeight: dotDiameter,
                  fontWeight: "700",
                  textAlign: "center",
                }}
              >
                {index + 1}
              </Text>
            ) : null}
          </View>
        );
      })}

      {candidateTypes.map((candidate, index) => {
        const isSelected = candidate.type === currentType;
        const diameter = isSelected ? candidateDiameter : Math.max(7, candidateDiameter * 0.76);
        const orbit = radii[index] ?? 0;
        const position = pointFor(draft.cursorAngle, Math.min(orbit, maxOrbit), diameter);
        const muted = candidate.type === "mute";
        const color = candidate.type === "strong"
          ? C.accent
          : candidate.type === "accent"
            ? C.accentMuted
            : muted
              ? C.textSecondary
              : C.textTertiary;
        const filled = candidate.type === "strong" || candidate.type === "accent";
        const letterColor = filled ? C.background : C.text;
        return (
          <View
            key={`candidate-${candidate.type}`}
            style={{
              position: "absolute",
              left: position.left,
              top: position.top,
              width: diameter,
              height: diameter,
              alignItems: "center",
              justifyContent: "center",
              opacity: isSelected ? 1 : 0.38,
              zIndex: isSelected ? 4 : 3,
            }}
          >
            {isSelected ? (
              <View
                style={{
                  position: "absolute",
                  width: diameter + Math.max(4, diameter * 0.42),
                  height: diameter + Math.max(4, diameter * 0.42),
                  borderRadius: (diameter + Math.max(4, diameter * 0.42)) / 2,
                  borderWidth: 1,
                  borderColor: C.accent,
                  backgroundColor: C.accentDim,
                }}
              />
            ) : null}
            <View style={markerStyle(candidate.shape, diameter, color, filled)} />
            <Text
              allowFontScaling={false}
              style={{
                position: "absolute",
                color: letterColor,
                fontSize: Math.max(7, Math.min(11, diameter * (compact ? 0.55 : 0.5))),
                lineHeight: diameter,
                fontWeight: "800",
                textAlign: "center",
              }}
            >
              {letterForType[candidate.type]}
            </Text>
          </View>
        );
      })}

      {draft.atLimit ? (
        <View
          style={{
            position: "absolute",
            top: center - 10,
            alignSelf: "center",
            paddingHorizontal: compact ? 5 : 7,
            paddingVertical: 2,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: C.accent,
            backgroundColor: C.surface,
            opacity: 0.96,
            zIndex: 5,
          }}
        >
          <Text
            allowFontScaling={false}
            style={{
              color: C.accent,
              fontSize: compact ? 7 : 8,
              lineHeight: compact ? 9 : 10,
              fontWeight: "800",
              letterSpacing: 0.6,
            }}
          >
            {`MAX 9 · ${Math.min(draft.notes.length, 9)}/9`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}