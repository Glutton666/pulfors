import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { Linking } from "react-native";
import { parseDeepLink } from "@/lib/deep-link-handler";
import { type VoiceCommand } from "@/lib/voice-commands";
import { DeepLinkQueue } from "@/lib/deep-link-queue";
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

  /**
   * Cold-start 경합 조건 대응을 DeepLinkQueue 로 위임한다.
   * - latest-wins: 핸들러 등록 전 여러 명령이 도착하면 마지막 것만 보관.
   * - setCommandHandler 가 핸들러를 등록할 때 pending 명령을 즉시 재전달.
   * 순수 클래스이므로 React 없이 단위 테스트 가능 (tests/deep-link-queue.test.ts).
   */
  const queueRef = useRef(new DeepLinkQueue());

  const dispatch = useCallback((url: string) => {
    if (!url) return;
    setLastUrl(url);
    const cmd = parseDeepLink(url);
    if (!cmd) {
      logger.info(`[deeplink] unrecognised url: ${url}`);
      return;
    }
    setLastCommand(cmd);
    const queued = (() => {
      try {
        return queueRef.current.dispatch(cmd);
      } catch (err) {
        logger.warn("[deeplink] command handler error:", err);
        return false;
      }
    })();
    if (queued) {
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
    try {
      queueRef.current.setHandler(h);
    } catch (err) {
      logger.warn("[deeplink] replayed command handler error:", err);
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
