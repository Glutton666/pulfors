import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "@/contexts/LanguageContext";
import { parseVoiceCommand, type VoiceCommand } from "@/lib/voice-commands";
import { startVoiceRecognition, isVoiceRecognitionSupported, type RecognitionHandle } from "@/lib/voice-recognition";
import { logger } from "@/lib/logger";

const ENABLED_KEY = "voice_assistant_enabled";
const NICKNAME_KEY = "voice_assistant_nickname";
const STRICT_KEY = "voice_assistant_strict";

export type VoiceCommandHandler = (cmd: VoiceCommand) => void;

interface Ctx {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  nickname: string;
  setNickname: (v: string) => void;
  strictNickname: boolean;
  setStrictNickname: (v: boolean) => void;
  isListening: boolean;
  lastTranscript: string;
  lastCommand: VoiceCommand | null;
  lastError: string;
  startListening: () => void;
  stopListening: () => void;
  setCommandHandler: (h: VoiceCommandHandler | null) => void;
  isSupported: boolean;
}

const VoiceAssistantContext = createContext<Ctx | null>(null);

export function VoiceAssistantProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const [enabled, setEnabledState] = useState(false);
  const [nickname, setNicknameState] = useState("");
  const [strictNickname, setStrictState] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastCommand, setLastCommand] = useState<VoiceCommand | null>(null);
  const [lastError, setLastError] = useState("");
  const handleRef = useRef<VoiceCommandHandler | null>(null);
  const recHandleRef = useRef<RecognitionHandle | null>(null);

  const isSupported = useMemo(() => isVoiceRecognitionSupported(), []);

  useEffect(() => {
    (async () => {
      try {
        const [e, n, s] = await Promise.all([
          AsyncStorage.getItem(ENABLED_KEY),
          AsyncStorage.getItem(NICKNAME_KEY),
          AsyncStorage.getItem(STRICT_KEY),
        ]);
        if (e === "1") setEnabledState(true);
        if (n) setNicknameState(n);
        if (s === "0") setStrictState(false);
      } catch {}
    })();
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    AsyncStorage.setItem(ENABLED_KEY, v ? "1" : "0").catch(() => {});
  }, []);
  const setNickname = useCallback((v: string) => {
    setNicknameState(v);
    AsyncStorage.setItem(NICKNAME_KEY, v).catch(() => {});
  }, []);
  const setStrictNickname = useCallback((v: boolean) => {
    setStrictState(v);
    AsyncStorage.setItem(STRICT_KEY, v ? "1" : "0").catch(() => {});
  }, []);

  const setCommandHandler = useCallback((h: VoiceCommandHandler | null) => {
    handleRef.current = h;
  }, []);

  const stopListening = useCallback(() => {
    recHandleRef.current?.stop();
    recHandleRef.current = null;
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported || isListening) return;
    setLastTranscript("");
    setLastError("");
    setIsListening(true);
    // 동기 콜백 경합을 막기 위해 로컬 토큰으로 핸들 식별
    const token = Symbol("voice-session");
    const localRef = { current: token };
    const handle = startVoiceRecognition({
      lang: language,
      onResult: (text) => {
        setLastTranscript(text);
        const cmd = parseVoiceCommand(text, { nickname, strictNickname });
        setLastCommand(cmd);
        if (cmd.type !== "unknown") {
          try {
            handleRef.current?.(cmd);
          } catch (err) {
            logger.warn("voice command handler error:", err);
          }
        }
      },
      onError: (err) => {
        setLastError(err);
      },
      onEnd: () => {
        setIsListening(false);
        // 같은 세션의 핸들만 정리 (이미 새 세션이 시작되었으면 그대로 둠)
        if (recHandleRef.current && (recHandleRef.current as any).__token === localRef.current) {
          recHandleRef.current = null;
        }
      },
    });
    if (handle) {
      (handle as any).__token = token;
      recHandleRef.current = handle;
    } else {
      setIsListening(false);
    }
  }, [isSupported, isListening, language, nickname, strictNickname]);

  const value = useMemo(
    () => ({
      enabled,
      setEnabled,
      nickname,
      setNickname,
      strictNickname,
      setStrictNickname,
      isListening,
      lastTranscript,
      lastCommand,
      lastError,
      startListening,
      stopListening,
      setCommandHandler,
      isSupported,
    }),
    [enabled, setEnabled, nickname, setNickname, strictNickname, setStrictNickname, isListening, lastTranscript, lastCommand, lastError, startListening, stopListening, setCommandHandler, isSupported]
  );

  return <VoiceAssistantContext.Provider value={value}>{children}</VoiceAssistantContext.Provider>;
}

export function useVoiceAssistant(): Ctx {
  const ctx = useContext(VoiceAssistantContext);
  if (!ctx) throw new Error("useVoiceAssistant must be used inside VoiceAssistantProvider");
  return ctx;
}
