import React from "react";
import { View } from "react-native";
import { useMetronomeScreen } from "@/hooks/useMetronomeScreen";
import { MetronomeScreenUI } from "@/components/MetronomeScreenUI";

export default function MetronomeScreen() {
  const screen = useMetronomeScreen();

  if (!screen.isLoaded) {
    return (
      <View style={[screen.styles.screen, { backgroundColor: screen.C.background }]} />
    );
  }

  return <MetronomeScreenUI {...screen} />;
}
