import React from "react";
import { useMetronomeScreen } from "@/hooks/useMetronomeScreen";
import { MetronomeScreenUI } from "@/components/MetronomeScreenUI";
import { AppPreparationScreen } from "@/components/AppPreparationScreen";
import { useLanguage } from "@/contexts/LanguageContext";

export default function MetronomeScreen() {
  const screen = useMetronomeScreen();
  const { language } = useLanguage();

  if (screen.settingsLoadError) {
    return (
      <AppPreparationScreen
        stage="error"
        language={language}
        onRetry={screen.retrySettingsLoad}
        onContinue={screen.continueWithoutSettings}
      />
    );
  }
  if (!screen.isLoaded) {
    return <AppPreparationScreen stage="settings" language={language} />;
  }

  return <MetronomeScreenUI {...screen} />;
}
