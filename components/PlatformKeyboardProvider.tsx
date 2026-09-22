import React from "react";
import { Platform } from "react-native";

type ProviderComponent = React.ComponentType<React.PropsWithChildren>;

let NativeKeyboardProvider: ProviderComponent | null = null;
if (Platform.OS !== "web") {
  NativeKeyboardProvider = (
    require("react-native-keyboard-controller") as {
      KeyboardProvider: ProviderComponent;
    }
  ).KeyboardProvider;
}

export function PlatformKeyboardProvider({ children }: React.PropsWithChildren) {
  if (!NativeKeyboardProvider) {
    return <>{children}</>;
  }
  return <NativeKeyboardProvider>{children}</NativeKeyboardProvider>;
}