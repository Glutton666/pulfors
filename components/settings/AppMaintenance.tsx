import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { confirmDestructive } from "@/lib/confirm";
import { restartActiveProfile, resetAllProfiles } from "@/lib/profiles";

export function AppMaintenance({ onResetApp, onShowOnboarding }: {
  onResetApp?: () => void; onShowOnboarding?: () => void;
}) {
  const { language } = useLanguage();
  const { colors: C } = useTheme();
  const ko = language === "ko";
  const [error, setError] = useState("");
  const buttonStyle = { padding: 16, minHeight: 48, borderWidth: 1, borderColor: C.border, borderRadius: 10 };
  return <View style={{ gap: 14 }}>
    <Text style={{ color: C.text, fontSize: 18 }}>{ko ? "앱 관리" : "App management"}</Text>
    {error !== "" && <Text accessibilityRole="alert" style={{ color: C.danger }}>{error}</Text>}
    <Pressable testID="settings-restart" accessibilityRole="button" style={buttonStyle} onPress={async () => {
      try { await restartActiveProfile(); }
      catch { setError(ko ? "저장하지 못해 재시작하지 않았습니다." : "Could not save. Restart cancelled."); }
    }}><Text style={{ color: C.accent }}>{ko ? "재시작 (데이터 유지)" : "Restart (keep all data)"}</Text></Pressable>
    {onShowOnboarding && <Pressable style={buttonStyle} onPress={onShowOnboarding} accessibilityRole="button">
      <Text style={{ color: C.text }}>{ko ? "시작 안내 다시 보기" : "Show onboarding again"}</Text>
    </Pressable>}
    {onResetApp && <Pressable testID="settings-reset-all" accessibilityRole="button" style={buttonStyle} onPress={() => confirmDestructive(
      ko ? "이 기기의 모든 프로필, 설정, 연습장, 기록, 악보와 사용자 음원 참조를 삭제합니다. 백업 파일은 삭제하지 않습니다. 계속할까요?"
        : "Delete ALL profiles, settings, practice books, history, scores and custom audio references on this device? Backup files are not deleted.",
      { title: ko ? "모든 프로필 초기화" : "Reset all profiles", confirmText: ko ? "모두 삭제" : "Delete all", cancelText: ko ? "취소" : "Cancel", onConfirm: async () => {
        try { await resetAllProfiles(); }
        catch { setError(ko ? "초기화를 완료하지 못했습니다. 앱을 다시 열면 안전하게 재시도합니다." : "Reset could not finish. Reopen the app to finish safely."); }
      } },
    )}><Text style={{ color: C.danger }}>{ko ? "모든 프로필과 앱 데이터 초기화" : "Reset all profiles and app data"}</Text></Pressable>}
  </View>;
}
