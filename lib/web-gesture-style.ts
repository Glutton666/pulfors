import { Platform, type ViewStyle } from "react-native";

/**
 * Web-only CSS that lets a View own pointer drags (no browser scroll/zoom or
 * text selection). `touchAction` is not part of React Native's ViewStyle type,
 * so the cast lives here instead of at every call site. Undefined on native.
 */
export const WEB_GESTURE_SURFACE: ViewStyle | undefined = Platform.OS === "web"
  ? ({ touchAction: "none", userSelect: "none" } as ViewStyle)
  : undefined;
