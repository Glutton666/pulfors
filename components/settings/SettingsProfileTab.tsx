import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  Switch,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Share } from "react-native";
import { useScale } from "@/lib/scale";
import { FontSize, Spacing } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useVoiceAssistant } from "@/contexts/VoiceAssistantContext";
import {
  loadPracticeRooms,
  addPracticeRoom,
  deletePracticeRoom,
  renamePracticeRoom,
  requestLocationPermission,
  type PracticeRoom,
} from "@/lib/practice-room";
import { loadGoals, saveGoals, type Goal } from "@/lib/activity-log";
import { make_styles } from "@/components/SettingsModal.styles";
import { AssistantShortcutsGuide } from "@/components/AssistantShortcutsGuide";

interface SettingsProfileTabProps {
  visible: boolean;
  username: string;
  onUsernameChange: (val: string) => void;
  roomTrackingActive: boolean;
  trackingRoomName: string | null;
  onStartRoomTracking: (room: { id: string; name: string }) => void;
  onStopRoomTracking: () => void;
  onResetApp?: () => void;
  onShowOnboarding?: () => void;
}

export function SettingsProfileTab({
  visible,
  username,
  onUsernameChange,
  roomTrackingActive,
  trackingRoomName,
  onStartRoomTracking,
  onStopRoomTracking,
  onResetApp,
  onShowOnboarding,
}: SettingsProfileTabProps) {
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = make_styles(C);
  const { language, t } = useLanguage();
  const { isSupported: voiceSupported, isEnabled: voiceEnabled, isListening: voiceListening, setEnabled: setVoiceEnabled } = useVoiceAssistant();

  const [localUsername, setLocalUsername] = useState(username);
  const [practiceRooms, setPracticeRooms] = useState<PracticeRoom[]>([]);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAssistantGuide, setShowAssistantGuide] = useState(false);
  const [webUrlCopied, setWebUrlCopied] = useState(false);
  const webUrlCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      setLocalUsername(username);
      setShowResetConfirm(false);
      loadPracticeRooms().then(setPracticeRooms);
    }
    return () => {
      if (webUrlCopiedTimerRef.current) clearTimeout(webUrlCopiedTimerRef.current);
    };
  }, [visible, username]);

  const handleAddRoom = useCallback(async () => {
    if (!newRoomName.trim()) return;
    setAddingRoom(true);
    const granted = await requestLocationPermission();
    if (!granted) {
      setAddingRoom(false);
      Alert.alert(t("settings", "permissionNeeded"), t("settings", "permissionLocationMsg"));
      return;
    }
    const room = await addPracticeRoom(newRoomName.trim());
    if (room) {
      setPracticeRooms((prev) => [...prev, room]);
      setNewRoomName("");
      setShowAddRoom(false);
    } else {
      Alert.alert(t("settings", "error"), t("settings", "locationError"));
    }
    setAddingRoom(false);
  }, [newRoomName, t]);

  const handleDeleteRoom = useCallback(async (id: string) => {
    await deletePracticeRoom(id);
    setPracticeRooms((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleRenameRoom = useCallback((room: PracticeRoom) => {
    if (Platform.OS === "ios" && typeof Alert.prompt === "function") {
      Alert.prompt(
        t("settings", "renameRoom"),
        undefined,
        async (newName: string) => {
          if (!newName?.trim()) return;
          await renamePracticeRoom(room.id, newName.trim());
          setPracticeRooms((prev) => prev.map((r) => r.id === room.id ? { ...r, name: newName.trim() } : r));
        },
        "plain-text",
        room.name,
      );
      return;
    }
    const newName = Platform.OS === "web" ? window.prompt(t("settings", "renameRoom"), room.name) : null;
    if (newName?.trim()) {
      renamePracticeRoom(room.id, newName.trim());
      setPracticeRooms((prev) => prev.map((r) => r.id === room.id ? { ...r, name: newName.trim() } : r));
    }
  }, [t]);

  const handleShareRoom = useCallback(async (room: PracticeRoom) => {
    const msg = t("settings", "shareRoomMsg").replace("%s", room.name);
    try { await Share.share({ message: msg }); } catch {}
  }, [t]);

  const handleAddRoomGoal = useCallback((room: PracticeRoom) => {
    const promptGoal = (defaultVal: string) => {
      if (Platform.OS === "ios") {
        Alert.prompt?.(
          t("settings", "addGoal"),
          t("settings", "goalMinutes"),
          async (val: string) => {
            const mins = parseInt(val, 10);
            if (!mins || mins <= 0) return;
            const goals = await loadGoals();
            const newGoal: Goal = {
              id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
              type: "room_time",
              target: mins,
              label: room.name,
            };
            goals.push(newGoal);
            await saveGoals(goals);
            Alert.alert(t("settings", "goalAdded"), t("settings", "goalAddedMsg").replace("%s", String(mins)));
          },
          "plain-text",
          defaultVal
        );
      } else {
        const val = Platform.OS === "web" ? window.prompt(t("settings", "goalMinutes"), defaultVal) : null;
        if (val) {
          const mins = parseInt(val, 10);
          if (!mins || mins <= 0) return;
          loadGoals().then(async (goals) => {
            const newGoal: Goal = {
              id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
              type: "room_time",
              target: mins,
              label: room.name,
            };
            goals.push(newGoal);
            await saveGoals(goals);
            Alert.alert(t("settings", "goalAdded"), t("settings", "goalAddedMsg").replace("%s", String(mins)));
          });
        }
      }
    };
    promptGoal("30");
  }, [t]);

  return (
    <>
      {/* Nickname */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="person-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "nickname")}</Text>
        </View>
        <TextInput
          style={[styles.usernameInput, { borderColor: C.accentMuted }]}
          value={localUsername}
          onChangeText={(text) => {
            setLocalUsername(text);
            onUsernameChange(text);
          }}
          placeholder={t("settings", "nicknamePlaceholder")}
          placeholderTextColor={C.textTertiary}
          maxLength={30}
          testID="settings-username"
        />
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      {/* Practice rooms */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="location" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "practiceRoom")}</Text>
        </View>

        {roomTrackingActive && trackingRoomName && (
          <View style={[styles.trackingBanner, { borderColor: C.success }]}>
            <View style={styles.trackingDot} />
            <Text style={[styles.trackingText, { color: C.success }]}>
              {trackingRoomName}{t("settings", "trackingAt")}
            </Text>
            <Pressable style={[styles.trackingStopBtn, { backgroundColor: C.danger }]} onPress={onStopRoomTracking}>
              <Text style={styles.trackingStopText}>{t("settings", "trackingStop")}</Text>
            </Pressable>
          </View>
        )}

        {practiceRooms.length === 0 && !showAddRoom && (
          <Text style={styles.roomEmptyHint}>{t("settings", "noRooms")}</Text>
        )}

        {practiceRooms.map((room) => {
          const isTracking = roomTrackingActive && trackingRoomName === room.name;
          return (
            <View key={room.id} style={styles.roomRow}>
              <View style={styles.roomInfo}>
                <Ionicons name="location-outline" size={S.ms(14, 0.4)} color={C.accent} />
                <Text style={styles.roomName} numberOfLines={1}>{room.name}</Text>
              </View>
              <View style={styles.roomActions}>
                {!isTracking && !roomTrackingActive && (
                  <Pressable
                    style={[styles.roomStartBtn, { backgroundColor: C.accentDim }]}
                    onPress={() => onStartRoomTracking({ id: room.id, name: room.name })}
                  >
                    <Ionicons name="play" size={S.ms(12, 0.4)} color={C.accent} />
                  </Pressable>
                )}
                <Pressable onPress={() => handleDeleteRoom(room.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={S.ms(14, 0.4)} color={C.textTertiary} />
                </Pressable>
              </View>
            </View>
          );
        })}

        {showAddRoom ? (
          <View style={[styles.addRoomForm, { borderColor: C.accentDim }]}>
            <Text style={styles.addRoomHint}>{t("settings", "addRoomHint")}</Text>
            <View style={styles.addRoomRow}>
              <TextInput
                style={[styles.usernameInput, { borderColor: C.accentMuted, flex: 1 }]}
                value={newRoomName}
                onChangeText={setNewRoomName}
                placeholder={t("settings", "roomNamePlaceholder")}
                placeholderTextColor={C.textTertiary}
                maxLength={30}
              />
              <Pressable style={[styles.addRoomSaveBtn, { backgroundColor: C.accent }]} onPress={handleAddRoom} disabled={addingRoom}>
                {addingRoom ? (
                  <ActivityIndicator size="small" color={C.surface} />
                ) : (
                  <Ionicons name="checkmark" size={S.ms(16, 0.4)} color={C.surface} />
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={[styles.addRoomBtn, { borderColor: C.accentDim }]} onPress={() => setShowAddRoom(true)}>
            <Ionicons name="add" size={S.ms(16, 0.4)} color={C.accent} />
            <Text style={[styles.addRoomBtnText, { color: C.accent }]}>{t("settings", "addRoom")}</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      {/* Backup / restore */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="cloud-download-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "backupData")}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          <Pressable
            style={[styles.addRoomBtn, { borderColor: C.accentDim, flex: 1 }]}
            onPress={async () => {
              const { exportBackup } = await import("@/lib/backup");
              const ok = await exportBackup();
              Alert.alert(
                ok ? t("settings", "complete") : t("settings", "error"),
                ok ? t("settings", "backupSuccess") : t("settings", "backupFail")
              );
            }}
          >
            <Ionicons name="download-outline" size={S.ms(15, 0.4)} color={C.accent} />
            <Text style={[styles.addRoomBtnText, { color: C.accent }]}>{t("settings", "createBackup")}</Text>
          </Pressable>
          <Pressable
            style={[styles.addRoomBtn, { borderColor: C.accentDim, flex: 1 }]}
            onPress={() => {
              Alert.alert(
                t("settings", "restoreBackup"),
                t("settings", "restoreWarning"),
                [
                  { text: t("settings", "cancel"), style: "cancel" },
                  {
                    text: t("settings", "restoreConfirm"),
                    style: "destructive",
                    onPress: async () => {
                      const { importBackup } = await import("@/lib/backup");
                      const result = await importBackup();
                      if (result.success) {
                        Alert.alert(
                          t("settings", "complete"),
                          t("settings", "restoreSuccess"),
                          [{
                            text: "OK",
                            onPress: async () => {
                              if (Platform.OS === "web") {
                                window.location.reload();
                              } else {
                                const { reloadAppAsync } = await import("expo");
                                await reloadAppAsync();
                              }
                            },
                          }]
                        );
                      } else {
                        const msgKey = result.errorCode === "unsupported_version"
                          ? "restoreUnsupportedVersion"
                          : "restoreFail";
                        const detail = result.validationDetail
                          ? `\n\n${t("settings", "restoreInvalidDetail")}: ${result.validationDetail}`
                          : "";
                        Alert.alert(t("settings", "error"), t("settings", msgKey) + detail);
                      }
                    },
                  },
                ]
              );
            }}
          >
            <Ionicons name="push-outline" size={S.ms(15, 0.4)} color={C.accent} />
            <Text style={[styles.addRoomBtnText, { color: C.accent }]}>{t("settings", "restoreBackup")}</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      {!!process.env.EXPO_PUBLIC_DOMAIN && (
        <>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="globe-outline" size={S.ms(18, 0.4)} color={C.accent} />
              <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "webVersionLink")}</Text>
            </View>
            <Text style={[styles.offsetHint, { color: C.textSecondary, marginBottom: Spacing.sm }]} numberOfLines={1}>
              {`https://${process.env.EXPO_PUBLIC_DOMAIN}`}
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                style={[styles.addRoomBtn, { borderColor: C.accentDim, flex: 1 }]}
                onPress={() => Linking.openURL(`https://${process.env.EXPO_PUBLIC_DOMAIN}`)}
              >
                <Ionicons name="open-outline" size={S.ms(15, 0.4)} color={C.accent} />
                <Text style={[styles.addRoomBtnText, { color: C.accent }]}>{t("settings", "webVersionOpen")}</Text>
              </Pressable>
              <Pressable
                style={[styles.addRoomBtn, { borderColor: webUrlCopied ? C.accent : C.accentDim, flex: 1 }]}
                onPress={async () => {
                  await Clipboard.setStringAsync(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
                  setWebUrlCopied(true);
                  if (webUrlCopiedTimerRef.current) clearTimeout(webUrlCopiedTimerRef.current);
                  webUrlCopiedTimerRef.current = setTimeout(() => setWebUrlCopied(false), 2000);
                }}
              >
                <Ionicons name={webUrlCopied ? "checkmark-outline" : "copy-outline"} size={S.ms(15, 0.4)} color={C.accent} />
                <Text style={[styles.addRoomBtnText, { color: C.accent }]}>
                  {webUrlCopied ? t("settings", "webVersionCopied") : t("settings", "webVersionCopy")}
                </Text>
              </Pressable>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: C.border }]} />
        </>
      )}

      {onShowOnboarding && (
        <Pressable style={styles.addRoomBtn} onPress={onShowOnboarding}>
          <Ionicons name="play-circle-outline" size={S.ms(15, 0.4)} color={C.accent} />
          <Text style={[styles.addRoomBtnText, { color: C.accent }]}>{t("settings", "showOnboardingAgain")}</Text>
        </Pressable>
      )}
      {onShowOnboarding && (
        <Text style={[styles.offsetHint, { color: C.textTertiary, marginBottom: 12 }]}>
          {t("settings", "showOnboardingAgainHint")}
        </Text>
      )}

      {onResetApp && !showResetConfirm && (
        <Pressable style={styles.resetButton} onPress={() => setShowResetConfirm(true)}>
          <Ionicons name="refresh-circle-outline" size={S.ms(18, 0.4)} color="#F85149" />
          <Text style={styles.resetButtonText}>{t("settings", "resetApp")}</Text>
        </Pressable>
      )}
      {onResetApp && showResetConfirm && (
        <View style={styles.resetConfirmBox}>
          <Text style={styles.resetConfirmText}>{t("settings", "resetConfirm")}</Text>
          <View style={styles.resetConfirmButtons}>
            <Pressable style={styles.resetCancelBtn} onPress={() => setShowResetConfirm(false)}>
              <Text style={styles.resetCancelText}>{t("settings", "cancel")}</Text>
            </Pressable>
            <Pressable
              style={styles.resetConfirmBtn}
              onPress={() => { setShowResetConfirm(false); onResetApp?.(); }}
            >
              <Text style={styles.resetConfirmBtnText}>{t("settings", "reset")}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      {/* Voice assistant */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="mic-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "voiceAssistant")}</Text>
        </View>
        <Text style={{ color: C.textSecondary, fontSize: FontSize.caption, fontFamily: "Inter_400Regular", marginBottom: Spacing.sm }}>
          {t("settings", "voiceAssistantHint")}
        </Text>
        {voiceSupported ? (
          <Pressable
            onPress={() => setVoiceEnabled(!voiceEnabled)}
            style={{ flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.overlay10 }}
          >
            <Text style={{ color: C.text, fontSize: 14, fontFamily: "Inter_500Medium" }}>
              {t("settings", "voiceAssistantEnabled")}
            </Text>
            <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: Spacing.xs }}>
              {voiceEnabled && voiceListening && (
                <Text style={{ color: C.accent, fontSize: FontSize.caption, fontFamily: "Inter_400Regular" }}>
                  {t("settings", "voiceAssistantListening")}
                </Text>
              )}
              <Switch
                value={voiceEnabled}
                onValueChange={setVoiceEnabled}
                trackColor={{ true: C.accent }}
                thumbColor={C.surface}
              />
            </View>
          </Pressable>
        ) : (
          <Text style={{ color: C.textSecondary, fontSize: FontSize.caption, fontFamily: "Inter_400Regular", paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: C.overlay10 }}>
            {t("settings", "voiceAssistantIosHint")}
          </Text>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: C.border }]} />

      {/* Assistant integration */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="link-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>
            {language === "ko" ? "어시스턴트 연동" : "Assistant Integration"}
          </Text>
        </View>
        <Text style={{ color: C.textSecondary, fontSize: FontSize.caption, fontFamily: "Inter_400Regular", marginBottom: Spacing.sm }}>
          {language === "ko"
            ? "Siri 또는 Google 어시스턴트로 메트로놈을 제어할 수 있습니다."
            : "Control the metronome with Siri or Google Assistant."}
        </Text>
        <Pressable
          onPress={() => setShowAssistantGuide(true)}
          style={{ flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.overlay10 }}
          testID="assistant-shortcuts-guide"
        >
          <Text style={{ color: C.text, fontSize: 14, fontFamily: "Inter_500Medium" }}>
            {language === "ko" ? "단축어 설정 방법 보기" : "How to set up shortcuts"}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={C.textSecondary} />
        </Pressable>
      </View>

      <AssistantShortcutsGuide
        visible={showAssistantGuide}
        onClose={() => setShowAssistantGuide(false)}
      />
    </>
  );
}
