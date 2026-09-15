import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useScale } from "@/lib/scale";
import type { TutorialAction, TutorialMode } from "@/lib/storage";

interface TutorialStep {
  id: string;
  action?: TutorialAction;
  titleKey: string;
  bodyKey: string;
}

const STEPS: Record<TutorialMode, TutorialStep[]> = {
  beat: [
    { id: "bpm", action: "bpm_change", titleKey: "beatBpmTitle", bodyKey: "beatBpmBody" },
    { id: "tap", action: "tap_tempo", titleKey: "beatTapTitle", bodyKey: "beatTapBody" },
    { id: "play", action: "toggle_play", titleKey: "beatPlayTitle", bodyKey: "beatPlayBody" },
  ],
  bar: [
    { id: "edit", action: "bar_edit", titleKey: "barEditTitle", bodyKey: "barEditBody" },
    { id: "add", action: "bar_add", titleKey: "barAddTitle", bodyKey: "barAddBody" },
    { id: "play", action: "toggle_play", titleKey: "barPlayTitle", bodyKey: "barPlayBody" },
  ],
  note: [
    { id: "queue", action: "note_queue", titleKey: "noteQueueTitle", bodyKey: "noteQueueBody" },
    { id: "play", action: "note_play", titleKey: "notePlayTitle", bodyKey: "notePlayBody" },
  ],
  practice: [
    { id: "open", action: "practice_open", titleKey: "practiceOpenTitle", bodyKey: "practiceOpenBody" },
    { id: "load", action: "practice_load", titleKey: "practiceLoadTitle", bodyKey: "practiceLoadBody" },
  ],
};

type TutorialTranslator = (section: "tutorial", key: string) => string;

export interface ModeTutorialModalProps {
  visible: boolean;
  mode: TutorialMode;
  completedSteps: string[];
  lastAction: TutorialAction | null;
  onStepComplete: (stepId: string) => void;
  onSkip: () => void;
  onComplete: () => void;
}

export function getTutorialSteps(mode: TutorialMode): TutorialStep[] {
  return STEPS[mode];
}

export function ModeTutorialModal({
  visible,
  mode,
  completedSteps,
  lastAction,
  onStepComplete,
  onSkip,
  onComplete,
}: ModeTutorialModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const steps = STEPS[mode];
  const [activeIndex, setActiveIndex] = useState(0);

  const firstIncomplete = useMemo(
    () => steps.findIndex((step) => !completedSteps.includes(step.id)),
    [completedSteps, steps],
  );

  useEffect(() => {
    if (!visible) return;
    setActiveIndex(firstIncomplete < 0 ? steps.length : firstIncomplete);
  }, [visible, firstIncomplete, steps.length]);

  useEffect(() => {
    if (!visible || !lastAction || activeIndex >= steps.length) return;
    const step = steps[activeIndex];
    if (step.action !== lastAction || completedSteps.includes(step.id)) return;
    onStepComplete(step.id);
    if (activeIndex + 1 >= steps.length) onComplete();
    else setActiveIndex((index) => index + 1);
  }, [activeIndex, completedSteps, lastAction, onComplete, onStepComplete, steps, visible]);

  if (!visible || activeIndex >= steps.length) return null;
  const step = steps[activeIndex];
  const progress = `${activeIndex + 1}/${steps.length}`;
  const translate = t as unknown as TutorialTranslator;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }}
      accessibilityViewIsModal
      testID="mode-tutorial"
    >
      <View
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.38)" }}
      />
      <View
        pointerEvents="auto"
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 18,
          maxWidth: 620,
          alignSelf: "center",
          backgroundColor: C.surface,
          borderColor: C.accent,
          borderWidth: 1,
          borderRadius: 18,
          padding: S.ms(18, 0.5),
          shadowColor: "#000",
          shadowOpacity: 0.28,
          shadowRadius: 16,
          elevation: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
          <Ionicons name="sparkles-outline" size={S.ms(19, 0.4)} color={C.accent} />
          <Text style={{ flex: 1, marginLeft: 8, color: C.accent, fontSize: S.ms(12, 0.4), fontWeight: "700" }}>
            {translate("tutorial", "modeTitle")} · {translate("tutorial", mode)}
          </Text>
          <Text accessibilityRole="text" style={{ color: C.textSecondary, fontSize: S.ms(12, 0.3) }}>
            {progress}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 5, marginBottom: 12 }}>
          {steps.map((entry, index) => (
            <View
              key={entry.id}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 3,
                backgroundColor: index <= activeIndex ? C.accent : C.border,
              }}
            />
          ))}
        </View>
        <Text style={{ color: C.text, fontSize: S.ms(19, 0.4), fontWeight: "700", marginBottom: 7 }}>
          {translate("tutorial", step.titleKey)}
        </Text>
        <Text style={{ color: C.textSecondary, fontSize: S.ms(14, 0.35), lineHeight: S.ms(21, 0.35) }}>
          {translate("tutorial", step.bodyKey)}
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 14, gap: 12 }}>
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel={translate("tutorial", "skip")}
            style={{ paddingHorizontal: 8, paddingVertical: 10 }}
          >
            <Text style={{ color: C.textTertiary, fontSize: S.ms(13, 0.3) }}>{translate("tutorial", "skip")}</Text>
          </Pressable>
          <Text style={{ color: C.accent, fontSize: S.ms(12, 0.3), fontWeight: "600", flexShrink: 1, textAlign: "right" }}>
            {translate("tutorial", "tryItNow")}
          </Text>
        </View>
      </View>
    </View>
  );
}