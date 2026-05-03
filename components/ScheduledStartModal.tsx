import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { Radius, Spacing, FontSize } from "@/constants/tokens";
import { measureOffset, type TimeSyncResult } from "@/lib/time-sync";
import {
  encodePayload,
  decodePayload,
  computeStartEpochMs,
  type ScheduledStartPayload,
} from "@/lib/scheduled-start";

export interface ScheduledStartModalProps {
  visible: boolean;
  onClose: () => void;
  bpm: number;
  beatsPerMeasure: number;
  onScheduled: (params: { payload: ScheduledStartPayload; startAtPerformanceTime: number }) => void;
}

type Mode = "menu" | "create" | "join" | "countdown";

const LEAD_OPTIONS = [5, 10, 20] as const;

export function ScheduledStartModal({
  visible,
  onClose,
  bpm,
  beatsPerMeasure,
  onScheduled,
}: ScheduledStartModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const S = useScale();
  const styles = useMemo(() => makeStyles(C), [C]);
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const [mode, setMode] = useState<Mode>("menu");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<TimeSyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [leadIn, setLeadIn] = useState<number>(10);
  const [payload, setPayload] = useState<ScheduledStartPayload | null>(null);
  const [code, setCode] = useState<string>("");

  const [joinInput, setJoinInput] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  const [countdownMs, setCountdownMs] = useState<number>(0);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setMode("menu");
    setPayload(null);
    setCode("");
    setJoinInput("");
    setJoinError(null);
    setCountdownMs(0);
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    if (fireTimerRef.current) {
      clearTimeout(fireTimerRef.current);
      fireTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      reset();
      setSyncResult(null);
      setSyncError(null);
    }
  }, [visible, reset]);

  const ensureSync = useCallback(async (): Promise<TimeSyncResult | null> => {
    if (syncResult && Date.now() - syncResult.measuredAt < 60_000) {
      return syncResult;
    }
    setSyncing(true);
    setSyncError(null);
    try {
      const r = await measureOffset();
      setSyncResult(r);
      return r;
    } catch {
      setSyncError(t("scheduledStart", "syncFailed"));
      return null;
    } finally {
      setSyncing(false);
    }
  }, [syncResult, t]);

  const handleEnterCreate = useCallback(async () => {
    setMode("create");
    await ensureSync();
  }, [ensureSync]);

  const handleEnterJoin = useCallback(async () => {
    setMode("join");
    await ensureSync();
  }, [ensureSync]);

  const handleGenerate = useCallback(async () => {
    const sync = await ensureSync();
    if (!sync) return;
    const serverNow = Date.now() + sync.offsetMs;
    const startEpochMs = computeStartEpochMs(serverNow, leadIn);
    const p: ScheduledStartPayload = { startEpochMs, bpm, beatsPerMeasure };
    setPayload(p);
    try {
      setCode(encodePayload(p));
    } catch {
      setSyncError(t("scheduledStart", "encodeFailed"));
    }
  }, [ensureSync, leadIn, bpm, beatsPerMeasure, t]);

  const handleCopy = useCallback(async () => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      if (Platform.OS === "android") {
        // android Toast가 없어 Alert 사용 자제 — 무음 OK
      }
    } catch {}
  }, [code]);

  const handleShare = useCallback(async () => {
    if (!code) return;
    const msg = t("scheduledStart", "shareMessage").replace("%s", code);
    try {
      await Share.share({ message: msg });
    } catch {}
  }, [code, t]);

  const startCountdown = useCallback(
    (target: ScheduledStartPayload, sync: TimeSyncResult) => {
      const localStartMs = target.startEpochMs - sync.offsetMs;
      const nowLocal = Date.now();
      const diff = localStartMs - nowLocal;
      if (diff <= 0) {
        Alert.alert(t("scheduledStart", "tooLateTitle"), t("scheduledStart", "tooLateMsg"));
        return;
      }
      const startAtPerf =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now() + diff
          : Date.now() + diff;
      setMode("countdown");
      setPayload(target);
      setCountdownMs(diff);
      tickTimerRef.current = setInterval(() => {
        const remaining = localStartMs - Date.now();
        setCountdownMs(Math.max(0, remaining));
        if (remaining <= 50) {
          if (tickTimerRef.current) {
            clearInterval(tickTimerRef.current);
            tickTimerRef.current = null;
          }
        }
      }, 100);
      fireTimerRef.current = setTimeout(() => {
        fireTimerRef.current = null;
        if (tickTimerRef.current) {
          clearInterval(tickTimerRef.current);
          tickTimerRef.current = null;
        }
        onScheduled({ payload: target, startAtPerformanceTime: startAtPerf });
        onClose();
      }, diff);
    },
    [onScheduled, onClose, t],
  );

  const handleStartFromCreator = useCallback(async () => {
    if (!payload) return;
    const sync = await ensureSync();
    if (!sync) return;
    startCountdown(payload, sync);
  }, [payload, ensureSync, startCountdown]);

  const handleJoinSubmit = useCallback(async () => {
    setJoinError(null);
    const decoded = decodePayload(joinInput);
    if (!decoded) {
      setJoinError(t("scheduledStart", "invalidCode"));
      return;
    }
    const sync = await ensureSync();
    if (!sync) return;
    const serverNow = Date.now() + sync.offsetMs;
    if (decoded.startEpochMs - serverNow <= 1500) {
      setJoinError(t("scheduledStart", "expiredCode"));
      return;
    }
    startCountdown(decoded, sync);
  }, [joinInput, ensureSync, startCountdown, t]);

  const handleCancelCountdown = useCallback(() => {
    reset();
  }, [reset]);

  const renderMenu = () => (
    <View style={{ gap: Spacing.md }}>
      <Text style={[styles.title, { color: C.text }]}>{t("scheduledStart", "title")}</Text>
      <Text style={[styles.body, { color: C.textSecondary }]}>{t("scheduledStart", "intro")}</Text>
      <Pressable
        style={({ pressed }) => [styles.bigBtn, { borderColor: C.border, backgroundColor: C.surface }, pressed && { opacity: 0.85 }]}
        onPress={handleEnterCreate}
        testID="scheduled-start-create"
      >
        <MaterialCommunityIcons name="qrcode" size={28} color={C.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.bigBtnTitle, { color: C.text }]}>{t("scheduledStart", "createTitle")}</Text>
          <Text style={[styles.bigBtnHint, { color: C.textSecondary }]}>{t("scheduledStart", "createHint")}</Text>
        </View>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.bigBtn, { borderColor: C.border, backgroundColor: C.surface }, pressed && { opacity: 0.85 }]}
        onPress={handleEnterJoin}
        testID="scheduled-start-join"
      >
        <MaterialCommunityIcons name="account-multiple-plus-outline" size={28} color={C.accent} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.bigBtnTitle, { color: C.text }]}>{t("scheduledStart", "joinTitle")}</Text>
          <Text style={[styles.bigBtnHint, { color: C.textSecondary }]}>{t("scheduledStart", "joinHint")}</Text>
        </View>
      </Pressable>
    </View>
  );

  const renderSyncStatus = () => {
    if (syncing) {
      return (
        <View style={styles.syncRow}>
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={[styles.syncText, { color: C.textSecondary }]}>{t("scheduledStart", "syncing")}</Text>
        </View>
      );
    }
    if (syncError) {
      return <Text style={[styles.syncText, { color: C.danger }]}>{syncError}</Text>;
    }
    if (syncResult) {
      const rtt = Math.round(syncResult.rttMs);
      return (
        <Text style={[styles.syncText, { color: C.textSecondary }]}>
          {t("scheduledStart", "synced").replace("%s", String(rtt))}
        </Text>
      );
    }
    return null;
  };

  const renderCreate = () => (
    <View style={{ gap: Spacing.md }}>
      <Text style={[styles.title, { color: C.text }]}>{t("scheduledStart", "createTitle")}</Text>
      {renderSyncStatus()}
      <Text style={[styles.label, { color: C.text }]}>
        {t("scheduledStart", "settingsSummary")
          .replace("%bpm", String(bpm))
          .replace("%meter", String(beatsPerMeasure))}
      </Text>

      <Text style={[styles.label, { color: C.text }]}>{t("scheduledStart", "leadInLabel")}</Text>
      <View style={{ flexDirection: "row", gap: Spacing.sm }}>
        {LEAD_OPTIONS.map((sec) => {
          const selected = leadIn === sec;
          return (
            <Pressable
              key={sec}
              style={[
                styles.pill,
                { borderColor: C.border, backgroundColor: selected ? C.accent : C.surface },
              ]}
              onPress={() => setLeadIn(sec)}
              testID={`lead-in-${sec}`}
            >
              <Text style={[styles.pillText, { color: selected ? "#fff" : C.text }]}>
                {sec}
                {t("scheduledStart", "secSuffix")}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!payload ? (
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: C.accent }, pressed && { opacity: 0.85 }]}
          onPress={handleGenerate}
          disabled={syncing || !!syncError}
          testID="scheduled-start-generate"
        >
          <Text style={styles.primaryBtnText}>{t("scheduledStart", "generate")}</Text>
        </Pressable>
      ) : (
        <View style={{ alignItems: "center", gap: Spacing.md }}>
          <View style={{ padding: Spacing.md, backgroundColor: "#fff", borderRadius: Radius.md }}>
            <QRCode value={code} size={180} />
          </View>
          <Pressable onPress={handleCopy} style={styles.codeBox}>
            <Text style={[styles.codeText, { color: C.text }]} selectable>
              {code}
            </Text>
            <Ionicons name="copy-outline" size={18} color={C.textSecondary} />
          </Pressable>
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <Pressable
              style={({ pressed }) => [styles.secondaryBtn, { borderColor: C.border, backgroundColor: C.surface }, pressed && { opacity: 0.85 }]}
              onPress={handleShare}
            >
              <Ionicons name="share-outline" size={18} color={C.text} />
              <Text style={[styles.secondaryBtnText, { color: C.text }]}>{t("scheduledStart", "share")}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.primaryBtn, { backgroundColor: C.accent, paddingHorizontal: Spacing.lg }, pressed && { opacity: 0.85 }]}
              onPress={handleStartFromCreator}
              testID="scheduled-start-fire"
            >
              <Text style={styles.primaryBtnText}>{t("scheduledStart", "startNow")}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );

  const renderJoin = () => (
    <View style={{ gap: Spacing.md }}>
      <Text style={[styles.title, { color: C.text }]}>{t("scheduledStart", "joinTitle")}</Text>
      {renderSyncStatus()}
      <Text style={[styles.body, { color: C.textSecondary }]}>{t("scheduledStart", "joinBody")}</Text>
      <TextInput
        style={[styles.input, { color: C.text, borderColor: C.border, backgroundColor: C.surface }]}
        placeholder={t("scheduledStart", "joinPlaceholder")}
        placeholderTextColor={C.textSecondary}
        value={joinInput}
        onChangeText={setJoinInput}
        autoCapitalize="characters"
        autoCorrect={false}
        testID="scheduled-start-join-input"
      />
      {joinError ? <Text style={[styles.errorText, { color: C.danger }]}>{joinError}</Text> : null}
      <Pressable
        style={({ pressed }) => [styles.primaryBtn, { backgroundColor: C.accent }, pressed && { opacity: 0.85 }]}
        onPress={handleJoinSubmit}
        disabled={syncing || !joinInput.trim()}
        testID="scheduled-start-join-submit"
      >
        <Text style={styles.primaryBtnText}>{t("scheduledStart", "joinSubmit")}</Text>
      </Pressable>
    </View>
  );

  const renderCountdown = () => {
    const sec = Math.max(0, Math.ceil(countdownMs / 1000));
    return (
      <View style={{ gap: Spacing.lg, alignItems: "center" as const }}>
        <Text style={[styles.title, { color: C.text }]}>{t("scheduledStart", "countdownTitle")}</Text>
        {payload ? (
          <Text style={[styles.body, { color: C.textSecondary }]}>
            {t("scheduledStart", "countdownInfo")
              .replace("%bpm", String(payload.bpm))
              .replace("%meter", String(payload.beatsPerMeasure))}
          </Text>
        ) : null}
        <Text style={[styles.countdown, { color: C.accent }]} testID="scheduled-start-countdown">
          {sec}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, { borderColor: C.border, backgroundColor: C.surface }, pressed && { opacity: 0.85 }]}
          onPress={handleCancelCountdown}
          testID="scheduled-start-cancel"
        >
          <Text style={[styles.secondaryBtnText, { color: C.text }]}>{t("scheduledStart", "cancel")}</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: C.background,
              borderColor: C.border,
              paddingTop: (insets.top || webTopInset) + 16,
              paddingBottom: 24 + (insets.bottom || webBottomInset),
            },
          ]}
        >
          <View style={styles.header}>
            {mode !== "menu" && mode !== "countdown" ? (
              <Pressable onPress={() => { setPayload(null); setCode(""); setMode("menu"); }} hitSlop={10} testID="scheduled-start-back">
                <Ionicons name="chevron-back" size={26} color={C.text} />
              </Pressable>
            ) : (
              <View style={{ width: 26 }} />
            )}
            <Text style={[styles.headerTitle, { color: C.text }]}>{t("scheduledStart", "title")}</Text>
            <Pressable onPress={onClose} hitSlop={10} testID="scheduled-start-close">
              <Ionicons name="close" size={26} color={C.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }} keyboardShouldPersistTaps="handled">
            {mode === "menu" && renderMenu()}
            {mode === "create" && renderCreate()}
            {mode === "join" && renderJoin()}
            {mode === "countdown" && renderCountdown()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    sheet: {
      flex: 1,
      borderTopWidth: 1,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerTitle: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.subtitle,
    },
    title: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.title,
    },
    body: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.body,
      lineHeight: 22,
    },
    label: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
    },
    bigBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.md,
      borderWidth: 1,
      borderRadius: Radius.md,
      padding: Spacing.md,
    },
    bigBtnTitle: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    bigBtnHint: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
      marginTop: 2,
    },
    pill: {
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.lg,
      borderRadius: Radius.lg,
      borderWidth: 1,
    },
    pillText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
    },
    primaryBtn: {
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      borderRadius: Radius.md,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    primaryBtnText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
      color: "#fff",
    },
    secondaryBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.xs,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      borderRadius: Radius.md,
      borderWidth: 1,
    },
    secondaryBtnText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
    },
    syncRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.sm,
    },
    syncText: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
    },
    codeBox: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: Spacing.sm,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: Radius.md,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      width: "100%" as const,
      backgroundColor: C.surface,
    },
    codeText: {
      flex: 1,
      fontFamily: "SpaceMono_400Regular",
      fontSize: FontSize.small,
    },
    input: {
      borderWidth: 1,
      borderRadius: Radius.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.md,
      fontFamily: "SpaceMono_400Regular",
      fontSize: FontSize.body,
    },
    errorText: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
    },
    countdown: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 96,
      textAlign: "center" as const,
    },
  });
