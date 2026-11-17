import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  createProfile, getActiveProfileId, listProfiles, switchProfile, updateProfile,
  type LocalProfile,
} from "@/lib/profiles";
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
  useEffect(() => { onExitStateChange?.(draft !== null, busy); }, [draft, busy, onExitStateChange]);
  const refresh = async () => setProfiles(await listProfiles());
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
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {profile.id !== getActiveProfileId() && button(ko ? "선택" : "Select", () => void run(() => switchProfile(profile.id)), `profile-select-${profile.id}`)}
            {button(ko ? "편집" : "Edit", () => startEdit(profile), `profile-edit-${profile.id}`)}
            {button(ko ? "백업" : "Back up", () => void run(async () => {
              if (!(await exportBackup(profile.id))) throw new Error(ko ? "백업 파일을 만들지 못했습니다." : "Backup failed");
              setNotice(ko ? "프로필 백업을 만들었습니다." : "Profile backup created.");
            }), `profile-export-${profile.id}`)}
          </View>
        </View>)}
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
