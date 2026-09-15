import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { Share } from "react-native";
import { useScale } from "@/lib/scale";
import { Spacing } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import { onAccentColor } from "@/lib/color-contrast";
import { useLanguage } from "@/contexts/LanguageContext";
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
import { filterPrimaryInstrumentCategories } from "@/lib/primary-instrument-search";

export interface SettingsProfileTabProps {
  visible: boolean;
  username: string;
  onUsernameChange: (val: string) => void;
  primaryInstrumentId: string | null;
  onPrimaryInstrumentChange: (id: string | null) => void;
  roomTrackingActive: boolean;
  trackingRoomName: string | null;
  onStartRoomTracking: (room: { id: string; name: string }) => void;
  onStopRoomTracking: () => void;
  onResetApp?: () => void;
  onShowOnboarding?: () => void;
  onShowTutorial?: () => void;
  onResetTutorials?: () => void;
}

export function SettingsProfileTab({
  visible,
  username,
  onUsernameChange,
  primaryInstrumentId,
  onPrimaryInstrumentChange,
  roomTrackingActive,
  trackingRoomName,
  onStartRoomTracking,
  onStopRoomTracking,
  onResetApp,
  onShowOnboarding,
  onShowTutorial,
  onResetTutorials,
}: SettingsProfileTabProps) {
  const { colors: C } = useTheme();
  const S = useScale();
  const styles = make_styles(C);
  const { language, t } = useLanguage();

  const [localUsername, setLocalUsername] = useState(username);
  const [practiceRooms, setPracticeRooms] = useState<PracticeRoom[]>([]);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [webUrlCopied, setWebUrlCopied] = useState(false);
  const [instrumentSearch, setInstrumentSearch] = useState("");
  const webUrlCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filteredInstrumentCategories = filterPrimaryInstrumentCategories(instrumentSearch);

  useEffect(() => {
    if (visible) {
      setLocalUsername(username);
      setShowResetConfirm(false);
      setInstrumentSearch("");
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

  const showRestoreResult = useCallback(async () => {
    const { importBackup } = await import("@/lib/backup");
    const result = await importBackup();
    if (result.success) {
      Alert.alert(t("settings", "complete"), t("settings", "restoreSuccess"), [{
        text: "OK",
        onPress: async () => {
          if (Platform.OS === "web") window.location.reload();
          else {
            const { reloadAppAsync } = await import("expo");
            await reloadAppAsync();
          }
        },
      }]);
      return;
    }
    const msgKey = result.errorCode === "unsupported_version"
      ? "restoreUnsupportedVersion"
      : result.recoveryStatus === "rolled_back"
        ? "restoreRolledBack"
        : result.recoveryStatus === "rollback_pending"
          ? "restoreRecoveryPending"
          : "restoreFail";
    const detail = result.validationDetail
      ? `\n\n${t("settings", "restoreInvalidDetail")}: ${result.validationDetail}`
      : "";
    const actions = result.recoveryStatus === "rollback_pending"
      ? [{ text: t("settings", "complete") }]
      : [
          { text: t("settings", "cancel"), style: "cancel" as const },
          { text: t("settings", "restoreRetry"), onPress: () => { void showRestoreResult(); } },
        ];
    Alert.alert(t("settings", "error"), t("settings", msgKey) + detail, actions);
  }, [t]);

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

      {/* Primary instrument */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="musical-note-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <Text style={[styles.sectionLabel, { color: C.text }]}>{t("settings", "primaryInstrument")}</Text>
        </View>
        <Text style={[styles.offsetHint, { color: C.textSecondary }]}>
          {t("settings", "primaryInstrumentHint")}
        </Text>
        <View style={{ position: "relative", marginTop: 10 }}>
          <TextInput
            value={instrumentSearch}
            onChangeText={setInstrumentSearch}
            placeholder={t("settings", "primaryInstrumentSearchPlaceholder")}
            placeholderTextColor={C.textTertiary}
            accessibilityLabel={t("settings", "primaryInstrumentSearchPlaceholder")}
            returnKeyType="search"
            style={[
              styles.usernameInput,
              {
                borderColor: C.accentMuted,
                paddingRight: instrumentSearch ? 42 : 12,
              },
            ]}
            testID="primary-instrument-search"
          />
          {instrumentSearch.length > 0 && (
            <Pressable
              onPress={() => setInstrumentSearch("")}
              accessibilityRole="button"
              accessibilityLabel={t("settings", "primaryInstrumentClear")}
              hitSlop={8}
              style={{ position: "absolute", right: 12, top: 12 }}
              testID="primary-instrument-search-clear"
            >
              <Ionicons name="close-circle" size={20} color={C.textSecondary} />
            </Pressable>
          )}
        </View>
        <View style={{ marginTop: 8 }}>
          <Pressable
            onPress={() => onPrimaryInstrumentChange(null)}
            accessibilityRole="radio"
            accessibilityState={{ selected: primaryInstrumentId === null }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderWidth: 1,
              borderColor: primaryInstrumentId === null ? C.accent : C.border,
              backgroundColor: primaryInstrumentId === null ? C.accentDim : C.surfaceLight,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
            testID="primary-instrument-none"
          >
            <Text style={{ color: C.text, fontFamily: "Inter_500Medium", fontSize: 14 }}>
              {t("settings", "primaryInstrumentNone")}
            </Text>
            {primaryInstrumentId === null && <Ionicons name="checkmark-circle" size={18} color={C.accent} />}
          </Pressable>
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            style={{ maxHeight: S.isTablet ? 320 : 230 }}
            contentContainerStyle={{ gap: 8, paddingTop: 8, paddingBottom: 2 }}
            testID="primary-instrument-results"
          >
            {filteredInstrumentCategories.length === 0 ? (
              <Text style={{ color: C.textSecondary, fontFamily: "Inter_400Regular", fontSize: 13, paddingVertical: 12 }}>
                {t("settings", "primaryInstrumentNoResults")}
              </Text>
            ) : (
              filteredInstrumentCategories.map((category) => (
                <View key={category.id} style={{ gap: 6 }}>
                  <Text style={{ color: C.textSecondary, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                    {category.name[language]}
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {category.instruments.map((instrument) => {
                      const selected = primaryInstrumentId === instrument.id;
                      return (
                        <Pressable
                          key={instrument.id}
                          onPress={() => onPrimaryInstrumentChange(instrument.id)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          style={{
                            borderWidth: 1,
                            borderColor: selected ? C.accent : C.border,
                            backgroundColor: selected ? C.accentDim : C.surfaceLight,
                            borderRadius: 9,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                          }}
                          testID={`primary-instrument-${instrument.id}`}
                        >
                          <Text style={{ color: selected ? C.accent : C.text, fontFamily: "Inter_500Medium", fontSize: 13 }}>
                            {instrument.name[language]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
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
                  <ActivityIndicator size="small" color={onAccentColor(C.accent)} />
                ) : (
                  <Ionicons name="checkmark" size={S.ms(16, 0.4)} color={onAccentColor(C.accent)} />
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
                    onPress: () => { void showRestoreResult(); },
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
      {onShowTutorial && (
        <Pressable style={styles.addRoomBtn} onPress={onShowTutorial} accessibilityRole="button">
          <Ionicons name="sparkles-outline" size={S.ms(15, 0.4)} color={C.accent} />
          <Text style={[styles.addRoomBtnText, { color: C.accent }]}>{t("settings", "showTutorialAgain")}</Text>
        </Pressable>
      )}
      {onShowTutorial && (
        <Text style={[styles.offsetHint, { color: C.textTertiary, marginBottom: 12 }]}>
          {t("settings", "showTutorialAgainHint")}
        </Text>
      )}
      {onResetTutorials && (
        <Pressable style={styles.addRoomBtn} onPress={onResetTutorials} accessibilityRole="button">
          <Ionicons name="refresh-outline" size={S.ms(15, 0.4)} color={C.textSecondary} />
          <Text style={[styles.addRoomBtnText, { color: C.textSecondary }]}>{t("settings", "resetTutorials")}</Text>
        </Pressable>
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

    </>
  );
}
