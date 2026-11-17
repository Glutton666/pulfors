import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import type { LocalProfile } from "@/lib/profiles";
import { repairProfile } from "@/lib/profiles";
import {
  exportProfileRecoveryData,
  getProfileRecoveryCandidates,
  recoverProfileRegistry,
  openLegacyDataInPlace,
} from "@/lib/profile-recovery";

type Language = "ko" | "en";
type PendingAction = { kind: "repair" | "rebuild"; candidate: LocalProfile } | { kind: "legacy" };

const COPY = {
  en: {
    title: "Profile recovery",
    intro: "Your saved profile registry could not be opened. These options preserve existing data; nothing will be wiped or replaced without confirmation.",
    rawExport: "Export raw device recovery data",
    exportHint: "This is a recovery file of raw device data, not a normal backup or media bundle.",
    candidatesTitle: "Profiles found on this device",
    refresh: "Refresh list",
    repair: "Repair profile…",
    rebuild: "Rebuild registry and open…",
    noCandidates: "No recovery candidates are available yet. Refresh to check again.",
    issueLabel: "Needs repair",
    healthyLabel: "Available",
    repairTitle: (candidate: LocalProfile) => `Repair ${candidate.name || "Unnamed profile"}?`,
    repairDetail: "Raw damaged values are preserved. Only malformed settings and rooms are reset; scores and practice data remain.",
    rebuildTitle: (candidate: LocalProfile) => `Rebuild and open ${candidate.name || "Unnamed profile"}?`,
    rebuildDetail: "The damaged registry snapshot is preserved. This rebuilds the registry around this candidate; the profile’s saved data is not changed.",
    legacyTitle: "Open existing data in place?",
    legacyDetail: "The original data will be used where it is now. Migration is deferred; nothing is copied, reset, or deleted.",
    legacyAction: "기존 데이터 복사 없이 열기",
    confirmRepair: "Repair profile",
    confirmRebuild: "Rebuild and open",
    confirmLegacy: "Open in place",
    cancel: "Cancel",
    working: "Working…",
    exportDone: "Recovery data exported.",
    candidatesError: "Could not load recovery candidates.",
    exportError: "Could not export recovery data.",
    repairDone: "Profile repaired. Refresh the candidate list if needed.",
    rebuildDone: "Profile registry recovered.",
    legacyDone: "Existing data opened in place.",
    actionError: "Could not complete this recovery action.",
  },
  ko: {
    title: "프로필 복구",
    intro: "저장된 프로필 목록을 열지 못했습니다. 기존 데이터를 보존하는 복구 방법입니다. 확인 없이 데이터를 초기화하거나 교체하지 않습니다.",
    rawExport: "기기 복구 데이터 내보내기",
    exportHint: "일반 백업이나 미디어 묶음이 아닌, 기기의 원본 복구 데이터입니다.",
    candidatesTitle: "이 기기에서 찾은 프로필",
    refresh: "목록 새로고침",
    repair: "프로필 복구…",
    rebuild: "목록을 복원하고 열기…",
    noCandidates: "복구할 프로필이 아직 없습니다. 새로고침해 다시 확인하세요.",
    issueLabel: "복구 필요",
    healthyLabel: "사용 가능",
    repairTitle: (candidate: LocalProfile) => `${candidate.name || "이름 없는 프로필"} 복구`,
    repairDetail: "손상된 원본 값은 보존됩니다. 잘못된 형식의 설정과 연습실만 초기화하며 악보와 연습 데이터는 유지됩니다.",
    rebuildTitle: (candidate: LocalProfile) => `${candidate.name || "이름 없는 프로필"} 목록 복원`,
    rebuildDetail: "손상된 프로필 목록 스냅샷은 보존됩니다. 이 프로필을 기준으로 목록을 복원하며 프로필 데이터는 변경하지 않습니다.",
    legacyTitle: "기존 데이터 그대로 열까요?",
    legacyDetail: "기존 데이터를 현재 위치에서 사용합니다. 복사는 하지 않고 마이그레이션을 미룹니다. 초기화하거나 삭제하지 않습니다.",
    legacyAction: "기존 데이터 복사 없이 열기",
    confirmRepair: "프로필 복구",
    confirmRebuild: "복원하고 열기",
    confirmLegacy: "그대로 열기",
    cancel: "취소",
    working: "처리 중…",
    exportDone: "복구 데이터를 내보냈습니다.",
    candidatesError: "복구 프로필 목록을 불러오지 못했습니다.",
    exportError: "복구 데이터를 내보내지 못했습니다.",
    repairDone: "프로필을 복구했습니다. 필요하면 목록을 새로고침하세요.",
    rebuildDone: "프로필 목록을 복구했습니다.",
    legacyDone: "기존 데이터를 그대로 열었습니다.",
    actionError: "복구 작업을 완료하지 못했습니다.",
  },
} as const;

export interface ProfileRecoveryPanelProps {
  onRecovered: () => Promise<void> | void;
  language?: Language;
}

export function ProfileRecoveryPanel({ onRecovered, language = "en" }: ProfileRecoveryPanelProps) {
  const ko = language === "ko";
  const text = COPY[language];
  const [candidates, setCandidates] = useState<LocalProfile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setCandidates(await getProfileRecoveryCandidates());
      setLoaded(true);
    } catch (reason) {
      setError(`${text.candidatesError} ${String(reason)}`);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [text.candidatesError]);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (reason) {
      setError(`${text.actionError} ${String(reason)}`);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const rawExport = () => void run(async () => {
    if (!(await exportProfileRecoveryData())) throw new Error(text.exportError);
    setNotice(text.exportDone);
  });

  const confirmation = (action: PendingAction) => {
    if (action.kind === "legacy") {
      return { title: text.legacyTitle, detail: text.legacyDetail, confirm: text.confirmLegacy, id: "recovery-legacy" };
    }
    if (action.kind === "repair") {
      return { title: text.repairTitle(action.candidate), detail: text.repairDetail, confirm: text.confirmRepair, id: `recovery-repair-${action.candidate.id}` };
    }
    return { title: text.rebuildTitle(action.candidate), detail: text.rebuildDetail, confirm: text.confirmRebuild, id: `recovery-rebuild-${action.candidate.id}` };
  };

  const confirmPending = () => {
    if (!pending) return;
    const action = pending;
    void run(async () => {
      if (action.kind === "legacy") {
        await openLegacyDataInPlace();
        setPending(null);
        setNotice(text.legacyDone);
        await onRecovered();
      } else if (action.kind === "repair") {
        await repairProfile(action.candidate.id);
        setPending(null);
        setNotice(text.repairDone);
        try {
          setCandidates(await getProfileRecoveryCandidates());
          setLoaded(true);
        } catch (reason) {
          setError(`${text.candidatesError} ${String(reason)}`);
        }
      } else {
        await recoverProfileRegistry(action.candidate.id);
        setPending(null);
        setNotice(text.rebuildDone);
        await onRecovered();
      }
    });
  };

  const button = (label: string, onPress: () => void, testID: string, primary = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: 46, justifyContent: "center", alignItems: "center", paddingHorizontal: 14,
        borderWidth: 1, borderColor: primary ? "#D4A846" : "#45413A", borderRadius: 11,
        backgroundColor: primary ? "#D4A846" : "transparent", opacity: busy ? 0.55 : pressed ? 0.72 : 1,
      })}
    >
      <Text style={{ color: primary ? "#171613" : "#E9E1D2", fontSize: 14, fontWeight: primary ? "700" : "600", textAlign: "center" }}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView
      testID="profile-recovery-panel"
      style={{ flex: 1, backgroundColor: "#11110F" }}
      contentContainerStyle={{ flexGrow: 1, width: "100%", maxWidth: 620, alignSelf: "center", padding: 20, paddingBottom: 32, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text accessibilityRole="header" style={{ color: "#F1EBDD", fontSize: 24, fontWeight: "700" }}>{text.title}</Text>
      <Text style={{ color: "#B8B1A5", fontSize: 15, lineHeight: 22 }}>{text.intro}</Text>
      {error ? <Text accessibilityRole="alert" testID="recovery-error" style={{ color: "#E58D7C", lineHeight: 21 }}>{error}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" testID="recovery-notice" style={{ color: "#D4A846", lineHeight: 21 }}>{notice}</Text> : null}
      {busy ? <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><ActivityIndicator color="#D4A846" /><Text style={{ color: "#B8B1A5" }}>{text.working}</Text></View> : null}

      <View style={{ padding: 14, borderWidth: 1, borderColor: "#45413A", borderRadius: 14, gap: 10 }}>
        {button(text.rawExport, rawExport, "recovery-export-raw", true)}
        <Text style={{ color: "#8E887E", fontSize: 13, lineHeight: 19 }}>{text.exportHint}</Text>
      </View>

      <View style={{ gap: 10, paddingTop: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Text accessibilityRole="header" style={{ color: "#F1EBDD", fontSize: 17, fontWeight: "600", flex: 1 }}>{text.candidatesTitle}</Text>
          {button(text.refresh, () => void refresh(), "recovery-refresh")}
        </View>
        {loaded && candidates.length === 0 ? <Text testID="recovery-empty" style={{ color: "#B8B1A5", lineHeight: 21 }}>{text.noCandidates}</Text> : null}
        {candidates.map(candidate => (
          <View key={candidate.id} testID={`recovery-candidate-${candidate.id}`} style={{ padding: 14, gap: 10, borderWidth: 1, borderColor: candidate.issue ? "#805246" : "#45413A", borderRadius: 13 }}>
            <View style={{ gap: 4 }}>
              <Text style={{ color: "#F1EBDD", fontSize: 16, fontWeight: "600" }}>{candidate.name || (ko ? "이름 없는 프로필" : "Unnamed profile")}</Text>
              <Text style={{ color: candidate.issue ? "#E58D7C" : "#D4A846", fontSize: 13 }}>{candidate.issue ? `${text.issueLabel}: ${candidate.issue}` : text.healthyLabel}</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {candidate.issue ? button(text.repair, () => { setError(""); setPending({ kind: "repair", candidate }); }, `recovery-repair-${candidate.id}`) : null}
              {button(text.rebuild, () => { setError(""); setPending({ kind: "rebuild", candidate }); }, `recovery-rebuild-${candidate.id}`, true)}
            </View>
            {pending && pending.kind !== "legacy" && pending.candidate.id === candidate.id ? (() => {
              const details = confirmation(pending);
              return (
                <View accessibilityRole="alert" testID={`${details.id}-confirmation`} style={{ padding: 12, gap: 9, borderWidth: 1, borderColor: "#8B7040", borderRadius: 11 }}>
                  <Text style={{ color: "#F1EBDD", fontWeight: "600" }}>{details.title}</Text>
                  <Text style={{ color: "#B8B1A5", lineHeight: 21 }}>{details.detail}</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {button(details.confirm, confirmPending, `${details.id}-confirm`, true)}
                    {button(text.cancel, () => setPending(null), `${details.id}-cancel`)}
                  </View>
                </View>
              );
            })() : null}
          </View>
        ))}
      </View>

      <View style={{ paddingTop: 4, gap: 9 }}>
        {pending?.kind === "legacy" ? (() => {
          const details = confirmation(pending);
          return (
            <View accessibilityRole="alert" testID={`${details.id}-confirmation`} style={{ padding: 13, gap: 9, borderWidth: 1, borderColor: "#8B7040", borderRadius: 12 }}>
              <Text style={{ color: "#F1EBDD", fontWeight: "600" }}>{details.title}</Text>
              <Text style={{ color: "#B8B1A5", lineHeight: 21 }}>{details.detail}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {button(details.confirm, confirmPending, `${details.id}-confirm`, true)}
                {button(text.cancel, () => setPending(null), `${details.id}-cancel`)}
              </View>
            </View>
          );
        })() : button(text.legacyAction, () => { setError(""); setPending({ kind: "legacy" }); }, "recovery-use-legacy")}
      </View>
    </ScrollView>
  );
}

export default ProfileRecoveryPanel;
