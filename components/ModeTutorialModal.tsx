import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();
  const steps = STEPS[mode];
  const [activeIndex, setActiveIndex] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    if (!visible) return;
    const firstIncomplete = steps.findIndex((step) => !completedSteps.includes(step.id));
    setActiveIndex(firstIncomplete < 0 ? 0 : firstIncomplete);
    setIsCompleting(false);
  }, [mode, visible]);

  useEffect(() => () => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
  }, []);

  useEffect(() => {
    if (!visible || !lastAction || isCompleting || activeIndex >= steps.length) return;
    const step = steps[activeIndex];
    if (step.action !== lastAction || completedSteps.includes(step.id)) return;
    onStepComplete(step.id);
    setIsCompleting(true);
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      if (activeIndex + 1 >= steps.length) onComplete();
      else {
        setActiveIndex((index) => index + 1);
        setIsCompleting(false);
      }
    }, 650);
  }, [activeIndex, completedSteps, isCompleting, lastAction, onComplete, onStepComplete, steps, visible]);

  if (!visible || activeIndex >= steps.length) return null;
  const step = steps[activeIndex];
  const progress = `${activeIndex + 1}/${steps.length}`;
  const translate = t as unknown as TutorialTranslator;
  const cardPlacement = step.action === "toggle_play" || step.action === "bar_edit" || step.action === "note_queue" || step.action === "note_play"
    ? "bottom"
    : "top";
  const cardPositionStyle = cardPlacement === "bottom"
    ? { bottom: (insets.bottom || 0) + 12 }
    : { top: (insets.top || (Platform.OS === "web" ? 67 : 0)) + 52 };

  return (
    <View
      // RN Web does not consistently translate box-none to CSS pointer-events.
      // Let the page controls receive touches and opt the card back in below.
      pointerEvents={Platform.OS === "web" ? "none" : "box-none"}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }}
      accessibilityViewIsModal
      testID="mode-tutorial"
    >
      <View
        // The card is informational only. It must never become the responder
        // for the control it is explaining; Skip is rendered as a separate
        // opt-in Pressable below.
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          ...cardPositionStyle,
          maxWidth: 620,
          alignSelf: "center",
          backgroundColor: C.surface,
          borderColor: C.accent,
          borderWidth: 1,
          borderRadius: 18,
          paddingHorizontal: S.ms(14, 0.4),
          paddingVertical: S.ms(12, 0.4),
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
                backgroundColor:
                  index < activeIndex || (index === activeIndex && isCompleting)
                    ? C.accent
                    : index === activeIndex
                      ? C.accentDim
                      : C.border,
              }}
            />
          ))}
        </View>
        <Text style={{ color: isCompleting ? C.accent : C.text, fontSize: S.ms(17, 0.4), fontWeight: "700", marginBottom: 5 }}>
          {isCompleting ? `✓ ${translate("tutorial", "stepCompleted")}` : translate("tutorial", step.titleKey)}
        </Text>
        <Text style={{ color: C.textSecondary, fontSize: S.ms(13, 0.35), lineHeight: S.ms(18, 0.35) }}>
          {translate("tutorial", step.bodyKey)}
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginTop: 8, gap: 12 }}>
          <Text style={{ color: C.accent, fontSize: S.ms(12, 0.3), fontWeight: "600", flexShrink: 1, textAlign: "right" }}>
            {translate("tutorial", "tryItNow")}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onSkip}
        pointerEvents="auto"
        accessibilityRole="button"
        accessibilityLabel={translate("tutorial", "skip")}
        style={{
          position: "absolute",
          right: 24,
          ...(cardPlacement === "bottom"
            ? { bottom: (insets.bottom || 0) + 20 }
            : { top: (insets.top || (Platform.OS === "web" ? 67 : 0)) + 60 }),
          paddingHorizontal: 8,
          paddingVertical: 10,
          zIndex: 10001,
        }}
      >
        <Text style={{ color: C.textTertiary, fontSize: S.ms(13, 0.3) }}>{translate("tutorial", "skip")}</Text>
      </Pressable>
    </View>
  );
}