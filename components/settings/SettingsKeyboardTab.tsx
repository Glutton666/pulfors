import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useScale } from "@/lib/scale";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { kbStyles } from "@/components/SettingsModal.styles";
import type { KbSectionKey } from "@/lib/i18n";
import type { TranslationFn } from "@/lib/i18n";
import type { SettingsScope } from "@/components/SettingsModal";
import {
  DEFAULT_BINDINGS,
  buildLabel,
  executeRebind,
  executeRebindReset,
  type KeyBindingsMap,
  type KeyAction,
  type KeyBinding,
} from "@/lib/keyboard-bindings";

interface KeyRebindOverlayProps {
  actionLabel: string;
  conflict: string | null;
  onKeyDown: (e: KeyboardEvent) => void;
  onCancel: () => void;
  t: TranslationFn;
}

function KeyRebindOverlay({ actionLabel, conflict, onKeyDown, onCancel, t }: KeyRebindOverlayProps) {
  const { colors: C } = useTheme();
  useEffect(() => {
    if (Platform.OS !== "web") return;
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onKeyDown]);

  return (
    <View style={kbStyles.overlayBg} pointerEvents="box-only" dataSet={{ capturesKeys: "true" }}>
      <View style={[kbStyles.overlayCard, { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1 }]}>
        <Text style={[kbStyles.overlayTitle, { color: C.text }]}>{t("keyboard", "listening")}</Text>
        <Text style={[kbStyles.overlayActionLabel, { color: C.accent }]}>{actionLabel}</Text>
        {conflict ? (
          <Text style={kbStyles.overlayConflict}>{conflict}</Text>
        ) : (
          <Text style={[kbStyles.overlayHint, { color: C.textSecondary }]}>{t("keyboard", "pressKeyHint")}</Text>
        )}
        <Pressable style={[kbStyles.overlayCancel, { borderColor: C.border }]} onPress={onCancel}>
          <Text style={[kbStyles.overlayCancelText, { color: C.textSecondary }]}>{t("keyboard", "cancelRebind")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const KB_SECTIONS: { titleKey: KbSectionKey; rows: { action: KeyAction; labelKey: KbSectionKey }[] }[] = [
  {
    titleKey: "sectionGeneral",
    rows: [
      { action: "playPause",        labelKey: "actionPlayPause" },
      { action: "tapTempo",         labelKey: "actionTapTempo" },
      { action: "bpmUp",            labelKey: "actionBpmUp" },
      { action: "bpmDown",          labelKey: "actionBpmDown" },
      { action: "bpmRight",         labelKey: "actionBpmRight" },
      { action: "bpmLeft",          labelKey: "actionBpmLeft" },
      { action: "toggleMenu",       labelKey: "actionToggleMenu" },
      { action: "toggleStopwatch",  labelKey: "actionToggleStopwatch" },
      { action: "toggleTimer",      labelKey: "actionToggleTimer" },
      { action: "openPracticeBook", labelKey: "actionOpenBook" },
      { action: "showShortcuts",    labelKey: "actionShowShortcuts" },
      { action: "escape",           labelKey: "actionEscape" },
    ],
  },
  {
    titleKey: "sectionBeat",
    rows: [
      { action: "addBeatNormal",  labelKey: "actionAddNormal" },
      { action: "addBeatAccent",  labelKey: "actionAddAccent" },
      { action: "addBeatStrong",  labelKey: "actionAddStrong" },
      { action: "addBeatMute",    labelKey: "actionAddMute" },
      { action: "removeBeat",     labelKey: "actionRemoveBeat" },
      { action: "cycleBeatTypes", labelKey: "actionCycleBeat" },
    ],
  },
  {
    titleKey: "sectionSub",
    rows: [
      { action: "addSubNormal", labelKey: "actionAddSubNormal" },
      { action: "addSubAccent", labelKey: "actionAddSubAccent" },
      { action: "addSubStrong", labelKey: "actionAddSubStrong" },
      { action: "addSubMute",   labelKey: "actionAddSubMute" },
      { action: "removeSub",    labelKey: "actionRemoveSub" },
    ],
  },
  {
    titleKey: "sectionBar",
    rows: [
      { action: "loopToggle",        labelKey: "actionLoopToggle" },
      { action: "blockPlayModeNext", labelKey: "actionBlockPlayNext" },
    ],
  },
];

interface SettingsKeyboardTabProps {
  keyBindings?: KeyBindingsMap;
  onKeyBindingsChange?: (kb: KeyBindingsMap) => void;
  scope?: SettingsScope;
}

const SCOPE_ACTIONS: Record<SettingsScope, readonly KeyAction[]> = {
  global: Object.keys(DEFAULT_BINDINGS) as KeyAction[],
  beat: ["playPause", "tapTempo", "bpmUp", "bpmDown", "bpmLeft", "bpmRight", "addBeatNormal", "addBeatAccent", "addBeatStrong", "addBeatMute", "removeBeat", "cycleBeatTypes", "addSubNormal", "addSubAccent", "addSubStrong", "addSubMute", "removeSub"],
  bar: ["playPause", "tapTempo", "bpmUp", "bpmDown", "bpmLeft", "bpmRight", "loopToggle", "blockPlayModeNext"],
  note: ["playPause"],
  // Stage owns its working digit-to-setlist mappings in StageModeOverlay.
  stage: [],
};

export function SettingsKeyboardTab({
  keyBindings: keyBindingsProp,
  onKeyBindingsChange,
  scope = "global",
}: SettingsKeyboardTabProps) {
  const { colors: C } = useTheme();
  const S = useScale();
  const { t } = useLanguage();

  const [localKeyBindings, setLocalKeyBindings] = useState<KeyBindingsMap>(keyBindingsProp ?? DEFAULT_BINDINGS);
  const [rebindingAction, setRebindingAction] = useState<KeyAction | null>(null);
  const [rebindConflict, setRebindConflict] = useState<string | null>(null);
  const [kbSavedToast, setKbSavedToast] = useState(false);
  const kbSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (keyBindingsProp) setLocalKeyBindings(keyBindingsProp);
  }, [keyBindingsProp]);

  useEffect(() => {
    return () => {
      if (kbSavedTimerRef.current) clearTimeout(kbSavedTimerRef.current);
    };
  }, []);

  const showKbSaved = useCallback(() => {
    setKbSavedToast(true);
    if (kbSavedTimerRef.current) clearTimeout(kbSavedTimerRef.current);
    kbSavedTimerRef.current = setTimeout(() => setKbSavedToast(false), 1500);
  }, []);
  const scopedActions = SCOPE_ACTIONS[scope];

  const handleRebindPress = (action: KeyAction) => {
    setRebindingAction(action);
    setRebindConflict(null);
  };

  const handleRebindKeyDown = (e: KeyboardEvent) => {
    if (!rebindingAction) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.code === "Escape") {
      setRebindingAction(null);
      setRebindConflict(null);
      return;
    }

    const newBinding: KeyBinding = {
      code: e.code,
      shift: e.shiftKey || undefined,
      ctrl: (e.ctrlKey || e.metaKey) || undefined,
      alt: e.altKey || undefined,
      label: buildLabel({ code: e.code, shift: e.shiftKey || undefined, ctrl: (e.ctrlKey || e.metaKey) || undefined, alt: e.altKey || undefined }),
    };
    if (!newBinding.shift) delete newBinding.shift;
    if (!newBinding.ctrl) delete newBinding.ctrl;
    if (!newBinding.alt) delete newBinding.alt;

    executeRebind(localKeyBindings, rebindingAction, newBinding, {
      setLocalKeyBindings,
      setRebindingAction,
      setRebindConflict,
      onKeyBindingsChange,
      showKbSaved,
      conflictMessage: t("keyboard", "conflict"),
      persistLegacy: scope === "global",
    });
  };

  return (
    <View>
      {rebindingAction !== null && (
        <KeyRebindOverlay
          actionLabel={t("keyboard", KB_SECTIONS.flatMap((s) => s.rows).find((r) => r.action === rebindingAction)?.labelKey ?? "actionPlayPause")}
          conflict={rebindConflict}
          onKeyDown={handleRebindKeyDown}
          onCancel={() => { setRebindingAction(null); setRebindConflict(null); }}
          t={t}
        />
      )}
      <Pressable
        style={[kbStyles.resetBtn, { borderColor: C.border }]}
        onPress={() => {
          Alert.alert(t("keyboard", "resetAll"), t("keyboard", "resetConfirm"), [
            { text: t("keyboard", "cancel"), style: "cancel" },
            {
              text: t("keyboard", "resetBtn"),
              onPress: () => {
                const bindings = scope === "global"
                  ? { ...DEFAULT_BINDINGS }
                  : scopedActions.reduce(
                    (next, action) => ({ ...next, [action]: DEFAULT_BINDINGS[action] }),
                    { ...localKeyBindings },
                  );
                executeRebindReset({
                  setLocalKeyBindings,
                  onKeyBindingsChange,
                  showKbSaved,
                  bindings,
                  persistLegacy: scope === "global",
                });
              },
            },
          ]);
        }}
      >
        <Text style={[kbStyles.resetBtnText, { color: C.textSecondary }]}>{t("keyboard", "resetAll")}</Text>
      </Pressable>
      {KB_SECTIONS.map((section) => ({
        ...section,
        rows: section.rows.filter((row) => scopedActions.includes(row.action)),
      })).filter((section) => section.rows.length > 0).map((section) => (
        <View key={section.titleKey} style={kbStyles.section}>
          <Text style={[kbStyles.sectionTitle, { color: C.textSecondary }]}>
            {t("keyboard", section.titleKey)}
          </Text>
          {section.rows.map((row) => {
            const binding = localKeyBindings[row.action];
            const isRebinding = rebindingAction === row.action;
            return (
              <Pressable
                key={row.action}
                style={[
                  kbStyles.row,
                  { borderBottomColor: C.border },
                  isRebinding && { backgroundColor: C.overlay10 },
                ]}
                onPress={() => handleRebindPress(row.action)}
              >
                <Text style={[kbStyles.actionLabel, { color: C.text }]}>
                  {t("keyboard", row.labelKey)}
                </Text>
                <View style={[
                  kbStyles.keyBadge,
                  { backgroundColor: isRebinding ? C.accent : C.surfaceLight, borderColor: C.border },
                ]}>
                  <Text style={[kbStyles.keyText, { color: isRebinding ? C.background : C.accent }]}>
                    {isRebinding ? t("keyboard", "pressKey") : buildLabel(binding)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      {kbSavedToast && (
        <View style={kbStyles.savedToast} pointerEvents="none">
          <Text style={[kbStyles.savedToastText, { color: C.accent }]}>
            {t("keyboard", "saved")}
          </Text>
        </View>
      )}
    </View>
  );
}
