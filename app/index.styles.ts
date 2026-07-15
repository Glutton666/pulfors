import { StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import type { ScaleValues } from "@/lib/scale";

export const make_styles = (C: typeof Colors, S: ScaleValues) => StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: S.isTablet ? 40 : 24,
    maxWidth: S.contentMaxWidth,
    alignSelf: S.isTablet ? "center" as const : undefined,
    width: S.isTablet ? "100%" as any : undefined,
    justifyContent: "flex-end",
    overflow: "hidden" as const,
  },
  contentBarMode: {
    flex: 1,
    paddingHorizontal: 0,
    justifyContent: "flex-end",
    overflow: "hidden" as const,
  },
  contentLandscape: {
    flex: 1,
    paddingHorizontal: S.ms(16, 0.3),
    overflow: "hidden" as const,
  },
  topSection: {
    flex: 5,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  topSectionPortraitBar: {
    flex: 5,
    justifyContent: "flex-start",
    alignItems: "center",
  },
  topSectionLandscapeBar: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "stretch",
  },
  topSectionLandscapeBeat: {
    flex: 3,
    justifyContent: "center",
    alignItems: "center",
    paddingRight: S.ms(50, 0.3),
  },
  bpmSection: {
    alignItems: "center",
    justifyContent: "flex-end",
    gap: S.ms(4, 0.3),
  },
  tempoLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(14, 0.3),
    color: C.accentMuted,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  beatHintText: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    letterSpacing: 1,
    opacity: 0.5,
  },
  modeHandle: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: S.ms(8, 0.5),
    paddingHorizontal: S.ms(24, 0.5),
    minWidth: S.ms(64, 0.5),
    minHeight: S.ms(36, 0.5),
    backgroundColor: C.overlay05,
    borderRadius: S.ms(12, 0.3),
  },
  menuButton: {
    position: "absolute",
    right: S.ms(20, 0.3),
    zIndex: 20,
    width: S.ms(40, 0.5),
    height: S.ms(40, 0.5),
    borderRadius: S.ms(20, 0.5),
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  menuDropdown: {
    position: "absolute",
    right: S.ms(20, 0.3),
    backgroundColor: C.surface,
    borderRadius: S.ms(12, 0.3),
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: S.ms(6, 0.4),
    minWidth: S.ms(180, 0.5),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.ms(12, 0.4),
    paddingHorizontal: S.ms(18, 0.4),
    paddingVertical: S.ms(14, 0.4),
  },
  menuItemPressed: {
    backgroundColor: C.surfaceLight,
  },
  menuItemText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: S.ms(15, 0.4),
    color: C.text,
  },
  menuItemLandscape: {
    paddingHorizontal: S.ms(10, 0.3),
    paddingVertical: S.ms(8, 0.3),
    gap: S.ms(8, 0.3),
  },
  menuItemTextLandscape: {
    fontSize: S.ms(13, 0.3),
  },
  menuDivider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: S.ms(12, 0.3),
    opacity: 0.5,
  },
});
