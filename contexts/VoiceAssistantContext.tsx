import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isVoiceRecognitionSupported, createWebRecognition } from "@/lib/voice-recognition";
import type { RecognitionEvent } from "@/lib/voice-recognition";
import { parseVoiceCommand } from "@/lib/voice-commands";
import { useDeepLink } from "@/contexts/DeepLinkContext";
import { SpeechWebView } from "@/components/SpeechWebView";
import type { SpeechWebViewHandle } from "@/components/SpeechWebView";
import { useLanguage } from "@/contexts/LanguageContext";
import { captureBreadcrumb } from "@/lib/error-tracking";

const STORAGE_KEY = "metronome_voice_assistant_v1";
const MIN_CONFIDENCE = 0.25;

export interface VoiceAssistantCtx {
  isSupported: boolean;
  isEnabled: boolean;
  isListening: boolean;
  setEnabled: (val: boolean) => void;
  /**
   * Call whenever the metronome play state changes.
   * While the metronome is playing, voice recognition is paused (click-blackout).
   */
  notifyPlayState: (isPlaying: boolean) => void;
}

const VoiceAssistantContext = createContext<VoiceAssistantCtx | null>(null);

export function VoiceAssistantProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const { dispatchCommand } = useDeepLink();

  const isSupported = isVoiceRecognitionSupported();
  const [isEnabled, setIsEnabledState] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [webViewReady, setWebViewReady] = useState(false);

  const speechWebRef = useRef<SpeechWebViewHandle | null>(null);
  const webRecRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const isPlayingRef = useRef(false);
  const isEnabledRef = useRef(false);
  const isListeningRef = useRef(false);

  const getLang = useCallback(
    () => (language === "ko" ? "ko-KR" : "en-US"),
    [language],
  );

  // Load persisted enabled state
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((val) => { if (val === "1") setIsEnabledState(true); })
      .catch(() => {});
  }, []);

  const handleEvent = useCallback(
    (event: RecognitionEvent) => {
      switch (event.type) {
        case "start":
          setIsListening(true);
          isListeningRef.current = true;
          break;
        case "end":
          setIsListening(false);
          isListeningRef.current = false;
          break;
        case "result": {
          const { transcript, isFinal, confidence } = event.result;
          if (!isFinal) return;
          // Confidence filter — skip if confidence is measured and too low
          if (confidence > 0 && confidence < MIN_CONFIDENCE) return;
          const cmd = parseVoiceCommand(transcript);
          if (cmd.type !== "unknown") {
            captureBreadcrumb({ category: "voice", message: `cmd:${cmd.type}`, level: "info" });
            dispatchCommand(cmd);
          }
          break;
        }
        case "error":
          captureBreadcrumb({ category: "voice", message: `err:${event.error}`, level: "warning" });
          break;
      }
    },
    [dispatchCommand],
  );

  const startListening = useCallback(() => {
    if (!isEnabledRef.current || !isSupported || isListeningRef.current) return;
    if (Platform.OS === "web") {
      if (webRecRef.current) return;
      try {
        webRecRef.current = createWebRecognition(getLang(), handleEvent, MIN_CONFIDENCE);
        webRecRef.current.start();
      } catch {
        captureBreadcrumb({ category: "voice", message: "web SR init failed", level: "warning" });
      }
    } else if (Platform.OS === "android") {
      speechWebRef.current?.start(getLang());
    }
  }, [isSupported, getLang, handleEvent]);

  const stopListening = useCallback(() => {
    if (Platform.OS === "web") {
      webRecRef.current?.stop();
      webRecRef.current = null;
    } else if (Platform.OS === "android") {
      speechWebRef.current?.stop();
    }
    setIsListening(false);
    isListeningRef.current = false;
  }, []);

  // When Android WebView becomes ready, start if we should be listening
  useEffect(() => {
    if (Platform.OS === "android" && webViewReady && isEnabledRef.current && !isPlayingRef.current) {
      startListening();
    }
  }, [webViewReady, startListening]);

  // Sync isEnabledRef and persist; start/stop accordingly
  useEffect(() => {
    isEnabledRef.current = isEnabled;
    AsyncStorage.setItem(STORAGE_KEY, isEnabled ? "1" : "0").catch(() => {});
    if (!isEnabled) {
      stopListening();
    } else if (!isPlayingRef.current) {
      if (Platform.OS !== "android" || webViewReady) {
        startListening();
      }
    }
  }, [isEnabled, startListening, stopListening, webViewReady]);

  const setEnabled = useCallback((val: boolean) => {
    setIsEnabledState(val);
  }, []);

  const notifyPlayState = useCallback(
    (isPlaying: boolean) => {
      isPlayingRef.current = isPlaying;
      if (!isEnabledRef.current || !isSupported) return;
      if (isPlaying) {
        stopListening();
      } else {
        startListening();
      }
    },
    [isSupported, startListening, stopListening],
  );

  return (
    <VoiceAssistantContext.Provider
      value={{ isSupported, isEnabled, isListening, setEnabled, notifyPlayState }}
    >
      {Platform.OS === "android" && isEnabled && isSupported && (
        <SpeechWebView
          ref={speechWebRef}
          onEvent={handleEvent}
          onReady={() => setWebViewReady(true)}
        />
      )}
      {children}
    </VoiceAssistantContext.Provider>
  );
}

export function useVoiceAssistant(): VoiceAssistantCtx {
  const ctx = useContext(VoiceAssistantContext);
  if (!ctx) throw new Error("useVoiceAssistant must be used inside VoiceAssistantProvider");
  return ctx;
}
