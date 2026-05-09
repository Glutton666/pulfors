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

  /**
   * Cold-start 경합 조건 대응:
   * getInitialURL() 콜백이 실행될 때 setCommandHandler 가 아직 호출되지 않아
   * handleRef.current 가 null 인 경우, 명령을 여기에 보관한다.
   * setCommandHandler 가 핸들러를 등록할 때 이 값을 확인하여 즉시 재전달한다.
   *
   * 설계 결정: 핸들러 등록 전 여러 URL이 도착하면 마지막 명령만 보관된다
   * (latest-wins). Cold start 에서 복수의 딥링크 URL 이 연달아 수신되는 상황은
   * 실제로 발생하지 않으며, 마지막 의도가 가장 최신이므로 이 정책이 적합하다.
   */
  const pendingCommandRef = useRef<VoiceCommand | null>(null);

  const dispatch = useCallback((url: string) => {
    if (!url) return;
    setLastUrl(url);
    const cmd = parseDeepLink(url);
    if (!cmd) {
      logger.info(`[deeplink] unrecognised url: ${url}`);
      return;
    }
    setLastCommand(cmd);
    if (handleRef.current) {
      pendingCommandRef.current = null;
      try {
        handleRef.current(cmd);
      } catch (err) {
        logger.warn("[deeplink] command handler error:", err);
      }
    } else {
      // 핸들러가 아직 등록되지 않았으면 보관 — setCommandHandler 에서 재전달.
      pendingCommandRef.current = cmd;
      logger.info("[deeplink] handler not yet registered, queuing command:", cmd.type);
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
    if (h && pendingCommandRef.current) {
      const pending = pendingCommandRef.current;
      pendingCommandRef.current = null;
      logger.info("[deeplink] replaying queued command:", pending.type);
      try {
        h(pending);
      } catch (err) {
        logger.warn("[deeplink] replayed command handler error:", err);
      }
    }
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
