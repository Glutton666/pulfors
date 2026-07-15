import React from "react";
import { Pressable, View, Text, StyleSheet, Platform } from "react-native";
import { AnimatedModal } from "@/components/AnimatedModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { Radius, Spacing, FontSize } from "@/constants/tokens";

// ─── MoreMenu 새 항목 추가 체크리스트 ────────────────────────────────────────
//
// 새 항목을 추가할 때 아래 4개 파일을 모두 수정해야 한다.
// 하나라도 빠뜨리면 회귀 테스트가 실패하거나 실제 기능이 동작하지 않는다.
//
//  1. lib/modal-routing.ts
//       ActiveModal 유니온 타입에 새 리터럴 추가 (예: | "myFeature")
//
//  2. components/MoreMenuModal.tsx  ← 지금 여기
//       a) MoreMenuModalProps 에 핸들러 prop 추가 (onMyFeature: () => void)
//       b) 함수 시그니처에서 구조 분해 추가
//       c) 새 <Pressable onPress={onMyFeature} testID="more-menu-myFeature"> 항목 추가
//
//  3. app/index.tsx
//       <MoreMenuModal … /> JSX 블록에 onMyFeature={() => openExclusive("myFeature")} 추가
//
//  4. tests/modal-routing.test.ts
//       MORE_MENU_ITEMS 배열에 ["myFeature", "showMyFeature"] 항목 추가
//
// ─────────────────────────────────────────────────────────────────────────────
export interface MoreMenuModalProps {
  visible: boolean;
  onClose: () => void;
  onScheduledStart: () => void;
  onFadeOut: () => void;
  onDrumKit: () => void;
  onScoreMode: () => void;
  onStageMode: () => void;
  onStemSep: () => void;
}

export function MoreMenuModal({ visible, onClose, onScheduledStart, onFadeOut, onDrumKit, onScoreMode, onStageMode, onStemSep }: MoreMenuModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const S = useScale();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const styles = makeStyles(C);

  return (
    <AnimatedModal visible={visible} transparent onRequestClose={onClose}>
      <Pressable style={[styles.overlay, S.isTablet && { alignItems: "center" as const }]} onPress={onClose} testID="more-menu-overlay">
        <View
          style={[
            styles.sheet,
            { backgroundColor: C.surface, borderColor: C.border, paddingTop: (insets.top || webTopInset) + 16, paddingBottom: 24 + (insets.bottom || (Platform.OS === "web" ? 34 : 0)) },
            S.isTablet && { maxWidth: 480, alignSelf: "center" as const, width: "100%" as const, borderRadius: Radius.xl, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <Text style={[styles.title, { color: C.text }]}>{t("main", "menuMore")}</Text>

          <Pressable
            style={({ pressed }) => [styles.item, { borderColor: C.border }, pressed && { opacity: 0.7 }]}
            onPress={onScheduledStart}
            accessibilityRole="button"
            accessibilityLabel={t("scheduledStart", "title")}
            testID="more-menu-scheduled-start"
          >
            <MaterialCommunityIcons name="clock-time-four-outline" size={S.ms(22, 0.4)} color={C.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: C.text }]}>{t("scheduledStart", "title")}</Text>
              <Text style={[styles.itemHint, { color: C.textSecondary }]}>{t("scheduledStart", "menuHint")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={S.ms(18, 0.3)} color={C.textSecondary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.item, { borderColor: C.border }, pressed && { opacity: 0.7 }]}
            onPress={onFadeOut}
            accessibilityRole="button"
            accessibilityLabel={t("fadeOut", "title")}
            testID="more-menu-fade-out"
          >
            <MaterialCommunityIcons name="volume-mute" size={S.ms(22, 0.4)} color={C.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: C.text }]}>{t("fadeOut", "title")}</Text>
              <Text style={[styles.itemHint, { color: C.textSecondary }]}>{t("fadeOut", "menuHint")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={S.ms(18, 0.3)} color={C.textSecondary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.item, { borderColor: C.border }, pressed && { opacity: 0.7 }]}
            onPress={onDrumKit}
            accessibilityRole="button"
            accessibilityLabel={t("drumKit", "title")}
            testID="more-menu-drum-kit"
          >
            <MaterialCommunityIcons name="grid" size={S.ms(22, 0.4)} color={C.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: C.text }]}>{t("drumKit", "title")}</Text>
              <Text style={[styles.itemHint, { color: C.textSecondary }]}>{t("drumKit", "menuHint")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={S.ms(18, 0.3)} color={C.textSecondary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.item, { borderColor: C.border }, pressed && { opacity: 0.7 }]}
            onPress={onScoreMode}
            accessibilityRole="button"
            accessibilityLabel={t("scoreMode", "title")}
            testID="more-menu-scoreMode"
          >
            <MaterialCommunityIcons name="music-note-whole" size={S.ms(22, 0.4)} color={C.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: C.text }]}>{t("scoreMode", "title")}</Text>
              <Text style={[styles.itemHint, { color: C.textSecondary }]}>{t("scoreMode", "menuHint")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={S.ms(18, 0.3)} color={C.textSecondary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.item, { borderColor: C.border }, pressed && { opacity: 0.7 }]}
            onPress={onStageMode}
            accessibilityRole="button"
            accessibilityLabel={t("stageMode", "title")}
            testID="more-menu-stageMode"
          >
            <MaterialCommunityIcons name="television-play" size={S.ms(22, 0.4)} color={C.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: C.text }]}>{t("stageMode", "title")}</Text>
              <Text style={[styles.itemHint, { color: C.textSecondary }]}>{t("stageMode", "menuHint")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={S.ms(18, 0.3)} color={C.textSecondary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.item, { borderColor: C.border }, pressed && { opacity: 0.7 }]}
            onPress={onStemSep}
            accessibilityRole="button"
            accessibilityLabel={t("stemSep", "title")}
            testID="more-menu-stemSep"
          >
            <MaterialCommunityIcons name="layers-triple-outline" size={S.ms(22, 0.4)} color={C.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: C.text }]}>{t("stemSep", "title")}</Text>
              <Text style={[styles.itemHint, { color: C.textSecondary }]}>{t("stemSep", "menuHint")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={S.ms(18, 0.3)} color={C.textSecondary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.closeBtn, { backgroundColor: C.background, borderColor: C.border }, pressed && { opacity: 0.8 }]}
            onPress={onClose}
            accessibilityRole="button"
            testID="more-menu-close"
          >
            <Text style={[styles.closeText, { color: C.text }]}>{t("scheduledStart", "close")}</Text>
          </Pressable>
        </View>
      </Pressable>
    </AnimatedModal>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end" as const,
    },
    sheet: {
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      paddingHorizontal: Spacing.lg,
      gap: Spacing.md,
    },
    handle: {
      alignSelf: "center" as const,
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.border,
      marginBottom: Spacing.sm,
    },
    title: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.subtitle,
      marginBottom: Spacing.xs,
    },
    item: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.md,
      borderWidth: 1,
      borderRadius: Radius.md,
    },
    itemTitle: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    itemHint: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
      marginTop: 2,
    },
    closeBtn: {
      marginTop: Spacing.sm,
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
      borderWidth: 1,
      alignItems: "center" as const,
    },
    closeText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
    },
  });
