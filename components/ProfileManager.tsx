import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  cleanupLegacyOriginals, createProfile, deleteProfile, getActiveProfileId,
  getLegacyCleanupCount, listProfiles, repairProfile, switchProfile, updateProfile,
  type LocalProfile,
} from "@/lib/profiles";
import { exportProfileRecoveryData } from "@/lib/profile-recovery";
import { filterPrimaryInstrumentCategories } from "@/lib/primary-instrument-search";
import { getCurrentLocation, requestLocationPermission, type PracticeRoom } from "@/lib/practice-room";
import { exportBackup, importBackup } from "@/lib/backup";

/** Drafts are local until Save; adding a profile never copies the active one. */
export function ProfileManager({
  onExitStateChange, roomTrackingActive, trackingRoomName, onStartRoomTracking, onStopRoomTracking,
}: {
  onExitStateChange?: (dirty: boolean, busy: boolean) => void;
  roomTrackingActive?: boolean;
  trackingRoomName?: string | null;
  onStartRoomTracking?: (room: { id: string; name: string }) => void;
  onStopRoomTracking?: () => void;
}) {
  const { colors: C } = useTheme();
  const { language } = useLanguage();
  const ko = language === "ko";
  const [profiles, setProfiles] = useState<LocalProfile[]>([]);
  const [draft, setDraft] = useState<LocalProfile | null>(null);
  const [search, setSearch] = useState("");
  const [roomName, setRoomName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cleanupCount, setCleanupCount] = useState(0);
  const [confirmation, setConfirmation] = useState<{ kind: "repair" | "delete" | "cleanup"; profile?: LocalProfile } | null>(null);
  useEffect(() => { onExitStateChange?.(draft !== null, busy); }, [draft, busy, onExitStateChange]);
  const refresh = async () => {
    const [nextProfiles, count] = await Promise.all([listProfiles(), getLegacyCleanupCount()]);
    setProfiles(nextProfiles);
    setCleanupCount(count);
  };
  useEffect(() => { void refresh().catch(e => setError(String(e))); }, []);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (e) {
      setError((ko ? "완료하지 못했습니다. 변경 내용은 유지됩니다. " : "Could not finish. Your draft is retained. ") + String(e));
    } finally { setBusy(false); }
  };
  const button = (label: string, onPress: () => void, testID?: string) => (
    <Pressable key={testID ?? label} accessibilityRole="button" accessibilityLabel={label} disabled={busy}
      testID={testID} onPress={onPress}
      style={{ minHeight: 44, justifyContent: "center", padding: 12, borderWidth: 1, borderColor: C.accentMuted, borderRadius: 10, opacity: busy ? 0.5 : 1 }}>
      <Text style={{ color: C.accent, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
  const inlineConfirm = (title: string, detail: string, confirmLabel: string, onConfirm: () => void, testID: string) => (
    <View accessibilityRole="alert" testID={`${testID}-confirmation`} style={{ gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.accentMuted }}>
      <Text style={{ color: C.text, fontWeight: "600" }}>{title}</Text>
      <Text style={{ color: C.textSecondary, lineHeight: 20 }}>{detail}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {button(confirmLabel, onConfirm, `${testID}-confirm`)}
        {button(ko ? "취소" : "Cancel", () => setConfirmation(null), `${testID}-cancel`)}
      </View>
    </View>
  );
  const inputStyle = { color: C.text, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, minHeight: 44 };
  const pickPhoto = () => run(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true });
    if (result.canceled || !result.assets[0] || !draft) return;
    const asset = result.assets[0];
    let uri: string;
    if (Platform.OS === "web") {
      if (!asset.base64) throw new Error(ko ? "사진을 읽을 수 없습니다." : "Could not read photo");
      uri = `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`;
    } else {
      const dir = `${FileSystem.documentDirectory}profile_photos/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      uri = `${dir}${Crypto.randomUUID()}.jpg`;
      await FileSystem.copyAsync({ from: asset.uri, to: uri });
    }
    setDraft({ ...draft, photoUri: uri });
  });
  const addRoom = () => run(async () => {
    if (!draft || !roomName.trim()) return;
    if (!(await requestLocationPermission())) throw new Error(ko ? "전경 위치 권한이 필요합니다." : "Foreground location permission is required.");
    const location = await getCurrentLocation();
    if (!location) throw new Error(ko ? "현재 위치를 확인할 수 없습니다." : "Could not read current location.");
    const room: PracticeRoom = { id: Crypto.randomUUID(), name: roomName.trim(), latitude: location.coords.latitude, longitude: location.coords.longitude, createdAt: Date.now() };
    setDraft({ ...draft, rooms: [...(draft.rooms ?? []), room] }); setRoomName("");
  });
  const startEdit = (profile: LocalProfile) => {
    setDraft({ ...profile, rooms: [...(profile.rooms ?? [])] });
    setSearch(""); setRoomName(""); setError(""); setNotice("");
  };
  return (
    <View style={{ gap: 14, width: "100%", maxWidth: 680, alignSelf: "center" }}>
      {error !== "" && <Text accessibilityRole="alert" testID="profile-error" style={{ color: C.danger }}>{error}</Text>}
      {notice !== "" && <Text accessibilityLiveRegion="polite" style={{ color: C.accent }}>{notice}</Text>}
      {busy && <ActivityIndicator color={C.accent} />}
      {draft ? <>
        <Text accessibilityRole="header" style={{ color: C.text, fontSize: 20 }}>
          {draft.id ? (ko ? "프로필 편집" : "Edit profile") : (ko ? "프로필 추가" : "Add profile")}
        </Text>
        <Text style={{ color: C.text }}>{ko ? "닉네임" : "Nickname"}</Text>
        <TextInput testID="profile-name" accessibilityLabel={ko ? "닉네임" : "Nickname"} editable={!busy}
          value={draft.name} maxLength={30} onChangeText={name => setDraft({ ...draft, name })} style={inputStyle} />
        {draft.photoUri ? <Image testID="profile-photo-preview" source={{ uri: draft.photoUri }} style={{ width: 88, height: 88, borderRadius: 44 }} /> : (
          <Text style={{ color: C.textSecondary }}>{ko ? "사진 미지정" : "No photo selected"}</Text>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {button(ko ? "사진 선택" : "Choose photo", () => void pickPhoto(), "profile-photo")}
          {draft.photoUri && button(ko ? "사진 제거" : "Remove photo", () => setDraft({ ...draft, photoUri: undefined }), "profile-photo-remove")}
        </View>
        <Text style={{ color: C.text }}>{ko ? "주악기" : "Primary instrument"}</Text>
        <TextInput testID="primary-instrument-search" accessibilityLabel={ko ? "악기 검색" : "Search instruments"} value={search}
          onChangeText={setSearch} editable={!busy} placeholder={ko ? "악기 검색" : "Search instruments"} placeholderTextColor={C.textSecondary} style={inputStyle} />
        {button((draft.primaryInstrumentId == null ? "✓ " : "") + (ko ? "미지정" : "None"), () => setDraft({ ...draft, primaryInstrumentId: null }), "primary-instrument-none")}
        <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
          {filterPrimaryInstrumentCategories(search).map(category => <View key={category.id} style={{ gap: 6, marginBottom: 10 }}>
            <Text style={{ color: C.textSecondary }}>{category.name[language]}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {category.instruments.map(instrument => button(
                (draft.primaryInstrumentId === instrument.id ? "✓ " : "") + instrument.name[language],
                () => setDraft({ ...draft, primaryInstrumentId: instrument.id }), `primary-instrument-${instrument.id}`,
              ))}
            </View>
          </View>)}
        </ScrollView>
        <Text style={{ color: C.text }}>{ko ? "연습실" : "Practice rooms"}</Text>
        {draft.id === getActiveProfileId() && roomTrackingActive && <View style={{ gap: 8 }}>
          <Text style={{ color: C.accent }}>{trackingRoomName} · {ko ? "기록 중" : "Tracking"}</Text>
          {onStopRoomTracking && button(ko ? "위치 기록 중지" : "Stop room tracking", () => void run(async () => { await onStopRoomTracking(); }))}
        </View>}
        {(draft.rooms ?? []).map(room => <View key={room.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, color: C.text }}>{room.name}</Text>
          {draft.id === getActiveProfileId() && !roomTrackingActive && onStartRoomTracking
            && profiles.find(profile => profile.id === draft.id)?.rooms?.some(saved => saved.id === room.id)
            && button(ko ? "기록" : "Track", () => void run(async () => { await onStartRoomTracking(room); }))}
          {button(ko ? "제외" : "Remove", () => setDraft({ ...draft, rooms: draft.rooms?.filter(r => r.id !== room.id) }))}
        </View>)}
        <TextInput accessibilityLabel={ko ? "새 연습실 이름" : "New practice room name"} editable={!busy} value={roomName} onChangeText={setRoomName}
          placeholder={ko ? "연습실 이름" : "Room name"} placeholderTextColor={C.textSecondary} maxLength={30} style={inputStyle} />
        {button(ko ? "현재 위치로 연습실 추가" : "Add room at current location", () => void addRoom(), "profile-room-add")}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {button(ko ? "저장" : "Save", () => void run(async () => {
            const input = { name: draft.name.trim(), photoUri: draft.photoUri, primaryInstrumentId: draft.primaryInstrumentId, rooms: draft.rooms };
            if (draft.id) await updateProfile(draft.id, input); else await createProfile(input);
            setDraft(null); await refresh();
          }), "profile-save")}
          {button(ko ? "취소" : "Cancel", () => { setDraft(null); setError(""); }, "profile-cancel")}
        </View>
        <Text style={{ color: C.textSecondary }}>{ko ? "저장 전에는 다른 프로필의 내용이 변경되지 않습니다." : "Other profiles are never changed by this draft."}</Text>
      </> : <>
        <Text style={{ color: C.textSecondary }}>{ko ? "프로필별 연습 데이터와 설정은 이 기기에 따로 저장됩니다." : "Each profile keeps separate practice data and settings on this device."}</Text>
        {profiles.map(profile => <View key={profile.id} testID={`profile-row-${profile.id}`}
          style={{ padding: 14, gap: 10, borderRadius: 14, borderWidth: 1, borderColor: profile.id === getActiveProfileId() ? C.accent : C.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {profile.photoUri && <Image source={{ uri: profile.photoUri }} style={{ width: 48, height: 48, borderRadius: 24 }} />}
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 18 }}>{profile.name || (ko ? "이름 없는 프로필" : "Unnamed profile")}</Text>
              {profile.id === getActiveProfileId() && <Text style={{ color: C.accent }}>{ko ? "현재 선택됨" : "Currently selected"}</Text>}
            </View>
          </View>
          {!!profile.issue && <View testID={`profile-issue-${profile.id}`} style={{ gap: 6 }}>
            <Text accessibilityRole="alert" style={{ color: C.danger }}>{profile.issue}</Text>
            <Text style={{ color: C.textSecondary }}>{ko ? "손상된 프로필은 복구 전까지 선택하거나 편집할 수 없습니다." : "This damaged profile cannot be selected or edited until repaired."}</Text>
          </View>}
          {profile.id === getActiveProfileId() && <Text testID={`profile-delete-protection-${profile.id}`} style={{ color: C.textSecondary }}>
            {ko ? "현재 또는 마지막 프로필은 삭제할 수 없습니다. 먼저 다른 프로필로 전환하세요." : "The active or last profile cannot be deleted. Switch to another profile first."}
          </Text>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {!profile.issue && profile.id !== getActiveProfileId() && button(ko ? "선택" : "Select", () => void run(() => switchProfile(profile.id)), `profile-select-${profile.id}`)}
            {!profile.issue && button(ko ? "편집" : "Edit", () => startEdit(profile), `profile-edit-${profile.id}`)}
            {button(ko ? "백업" : "Back up", () => void run(async () => {
              if (!(await exportBackup(profile.id))) throw new Error(ko ? "백업 파일을 만들지 못했습니다." : "Backup failed");
              setNotice(ko ? "프로필 백업을 만들었습니다." : "Profile backup created.");
            }), `profile-export-${profile.id}`)}
            {!!profile.issue && button(ko ? "손상 데이터 복구 파일 내보내기" : "Export raw recovery data", () => void run(async () => {
              if (!(await exportProfileRecoveryData())) throw new Error(ko ? "복구 파일을 만들지 못했습니다." : "Could not export recovery data.");
              setNotice(ko ? "기기 복구 데이터를 내보냈습니다." : "Raw device recovery data exported.");
            }), `profile-recovery-export-${profile.id}`)}
            {!!profile.issue && confirmation?.kind !== "repair" && button(ko ? "복구…" : "Repair…", () => { setConfirmation({ kind: "repair", profile }); setError(""); }, `profile-repair-${profile.id}`)}
            {!!profile.issue && confirmation?.kind === "repair" && confirmation.profile?.id === profile.id && inlineConfirm(
              ko ? `${profile.name || "이름 없는 프로필"} 복구` : `Repair ${profile.name || "Unnamed profile"}`,
              ko ? "손상된 원본 값은 보존됩니다. 잘못된 형식의 설정과 연습실만 초기화하며 악보와 연습 데이터는 유지됩니다." : "Raw damaged values are preserved. Only malformed settings and rooms are reset; scores and practice data remain.",
              ko ? "복구 진행" : "Repair profile",
              () => void run(async () => { await repairProfile(profile.id); setConfirmation(null); await refresh(); setNotice(ko ? "프로필을 복구했습니다." : "Profile repaired."); }),
              `profile-repair-${profile.id}`,
            )}
            {profile.id !== getActiveProfileId() && button(ko ? "삭제…" : "Delete…", () => { setConfirmation({ kind: "delete", profile }); setError(""); }, `profile-delete-${profile.id}`)}
          </View>
          {confirmation?.kind === "delete" && confirmation.profile?.id === profile.id && (
            <View accessibilityRole="alert" testID={`profile-delete-${profile.id}-confirmation`} style={{ gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: C.danger }}>
              <Text style={{ color: C.text, fontWeight: "600" }}>{ko ? `${profile.name || "이름 없는 프로필"}을(를) 영구 삭제할까요?` : `Permanently delete ${profile.name || "Unnamed profile"}?`}</Text>
              <Text style={{ color: C.textSecondary, lineHeight: 20 }}>{ko ? "이 프로필의 설정과 연습 데이터가 영구 삭제됩니다. 현재 프로필과 마지막 프로필은 삭제할 수 없습니다." : "This permanently deletes this profile’s settings and practice data. The active or last profile cannot be deleted."}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {button(ko ? "먼저 백업 후 삭제" : "Back up, then delete", () => void run(async () => {
                  if (!(await exportBackup(profile.id))) throw new Error(ko ? "백업 파일을 만들지 못했습니다. 프로필은 삭제되지 않았습니다." : "Backup failed; the profile was not deleted.");
                  await deleteProfile(profile.id); setConfirmation(null); await refresh();
                  setNotice(ko ? "백업 후 프로필을 삭제했습니다." : "Profile backed up and deleted.");
                }), `profile-delete-export-${profile.id}`)}
                {button(ko ? "영구 삭제" : "Delete permanently", () => void run(async () => {
                  await deleteProfile(profile.id); setConfirmation(null); await refresh();
                  setNotice(ko ? "프로필을 삭제했습니다." : "Profile deleted.");
                }), `profile-delete-confirm-${profile.id}`)}
                {button(ko ? "취소" : "Cancel", () => setConfirmation(null), `profile-delete-cancel-${profile.id}`)}
              </View>
            </View>
          )}
        </View>)}
        {cleanupCount > 0 && <>
          <Text style={{ color: C.textSecondary }}>{ko ? `확인된 동일 원본 ${cleanupCount}개가 보관되어 있습니다.` : `${cleanupCount} verified identical original${cleanupCount === 1 ? "" : "s"} retained.`}</Text>
          {confirmation?.kind !== "cleanup" && button(ko ? "동일 원본 정리…" : "Clean up identical originals…", () => { setConfirmation({ kind: "cleanup" }); setError(""); }, "profile-cleanup")}
          {confirmation?.kind === "cleanup" && inlineConfirm(
            ko ? "보관된 원본만 정리할까요?" : "Remove retained originals?",
            ko ? "검증된 동일 원본만 삭제합니다. 현재 프로필 데이터는 변경되지 않습니다." : "This deletes only verified identical retained originals. Current profile data is not changed.",
            ko ? "원본 정리" : "Clean originals",
            () => void run(async () => {
              const cleaned = await cleanupLegacyOriginals();
              setConfirmation(null); await refresh();
              setNotice(ko ? `동일 원본 ${cleaned}개를 정리했습니다.` : `Cleaned ${cleaned} identical original${cleaned === 1 ? "" : "s"}.`);
            }),
            "profile-cleanup",
          )}
        </>}
        {profiles.length > 0 && profiles.every(profile => profile.id === getActiveProfileId()) && (
          <Text testID="profile-delete-protection" style={{ color: C.textSecondary }}>
            {ko ? "현재 또는 마지막 프로필은 삭제할 수 없습니다. 먼저 다른 프로필로 전환하세요." : "The active or last profile cannot be deleted. Switch to another profile first."}
          </Text>
        )}
        {button(ko ? "프로필 추가" : "Add profile", () => startEdit({ id: "", name: "", primaryInstrumentId: null, rooms: [] }), "profile-add")}
        {button(ko ? "백업을 새 프로필로 불러오기" : "Import backup as new profile", () => void run(async () => {
          const result = await importBackup();
          if (!result.success) {
            if (result.errorCode) throw new Error(ko ? "백업 파일을 확인해 주세요." : "Please check the backup file.");
            return;
          }
          await refresh(); setNotice(ko ? "기존 프로필을 변경하지 않고 새 프로필로 추가했습니다." : "Added a new profile without changing existing profiles.");
        }), "profile-import")}
      </>}
    </View>
  );
}
