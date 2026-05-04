import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { Linking } from "react-native";
import { parseDeepLink } from "@/lib/deep-link-handler";
import { type VoiceCommand } from "@/lib/voice-commands";
import { logger } from "@/lib/logger";

export type DeepLinkCommandHandler = (cmd: VoiceCommand) => void;

interface Ctx {
  lastCommand: VoiceCommand | null;
  lastUrl: string;
  setCommandHandler: (h: DeepLinkCommandHandler | null) => void;
}

const DeepLinkContext = createContext<Ctx | null>(null);

export function DeepLinkProvider({ children }: { children: ReactNode }) {
  const [lastCommand, setLastCommand] = useState<VoiceCommand | null>(null);
  const [lastUrl, setLastUrl] = useState("");
  const handleRef = useRef<DeepLinkCommandHandler | null>(null);

  const dispatch = useCallback((url: string) => {
    if (!url) return;
    setLastUrl(url);
    const cmd = parseDeepLink(url);
    if (!cmd) {
      logger.info(`[deeplink] unrecognised url: ${url}`);
      return;
    }
    setLastCommand(cmd);
    try {
      handleRef.current?.(cmd);
    } catch (err) {
      logger.warn("[deeplink] command handler error:", err);
    }
  }, []);

  useEffect(() => {
    Linking.getInitialURL()
      .then((url) => { if (url) dispatch(url); })
      .catch(() => {});

    const sub = Linking.addEventListener("url", (event) => {
      dispatch(event.url);
    });
    return () => sub.remove();
  }, [dispatch]);

  const setCommandHandler = useCallback((h: DeepLinkCommandHandler | null) => {
    handleRef.current = h;
  }, []);

  return (
    <DeepLinkContext.Provider value={{ lastCommand, lastUrl, setCommandHandler }}>
      {children}
    </DeepLinkContext.Provider>
  );
}

export function useDeepLink(): Ctx {
  const ctx = useContext(DeepLinkContext);
  if (!ctx) throw new Error("useDeepLink must be used inside DeepLinkProvider");
  return ctx;
}
