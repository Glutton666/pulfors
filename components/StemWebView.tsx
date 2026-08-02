"use no memo";
/**
 * StemWebView — onnxruntime-web (WASM) 을 숨긴 WebView 에서 실행하는 컴포넌트.
 *
 * 사용:
 *   const ref = useRef<StemWebViewHandle>(null);
 *   const ortLib = await ref.current?.waitForOrtLib();
 *   await runStemSeparation(uri, name, cfg, onProgress, signal, ortLib);
 *
 * Android 전용 — iOS/웹에서는 null 을 반환합니다.
 */
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Platform } from "react-native";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import { STEM_WEBVIEW_HTML, createWebViewOrtLib, BridgeOrtLib } from "@/lib/stem-webview-bridge";

const HTML_FILENAME = "stem_inference.html";

export interface StemWebViewHandle {
  /** WebView 가 준비될 때까지 대기 후 OrtLib 를 반환합니다. */
  waitForOrtLib(): Promise<BridgeOrtLib>;
}

type MsgHandler = (raw: string) => void;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface StemWebViewProps {}

export const StemWebView = forwardRef<StemWebViewHandle, StemWebViewProps>(
  (_props, ref) => {
    const webViewRef = useRef<WebView | null>(null);
    const [htmlUri, setHtmlUri] = useState<string | null>(null);
    const [ortReady, setOrtReady] = useState(false);

    // Message listener registry — bridge subscribes here
    const msgHandlers = useRef<Set<MsgHandler>>(new Set());

    // WebView ready promise
    const readyResolvers = useRef<Array<() => void>>([]);

    // OrtLib instance (created once, reused)
    const ortLibRef = useRef<BridgeOrtLib | null>(null);

    // Write HTML to disk once on mount
    useEffect(() => {
      if (Platform.OS !== "android") return;
      const path = (FileSystem.documentDirectory ?? "") + HTML_FILENAME;
      FileSystem.writeAsStringAsync(path, STEM_WEBVIEW_HTML)
        .then(() => setHtmlUri(path))
        .catch(() => {
          // fallback: use inline HTML (model fetch via file:// may not work)
          setHtmlUri("__inline__");
        });
    }, []);

    // Create OrtLib bridge once htmlUri is known
    useEffect(() => {
      if (!htmlUri) return;

      const sendMsg = (msg: string) => {
        // Inject as a message event into the WebView
        const escaped = msg.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
        webViewRef.current?.injectJavaScript(
          `(function(){var e=new MessageEvent('message',{data:'${escaped}'});window.dispatchEvent(e);})(); true;`
        );
      };

      const subscribe = (handler: MsgHandler) => {
        msgHandlers.current.add(handler);
        return () => { msgHandlers.current.delete(handler); };
      };

      ortLibRef.current = createWebViewOrtLib(sendMsg, subscribe);
    }, [htmlUri]);

    const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
      const raw = event.nativeEvent.data;
      // Dispatch to all bridge subscribers
      msgHandlers.current.forEach((h) => h(raw));

      // Also handle 'ready' to resolve waitForOrtLib
      try {
        const msg = JSON.parse(raw) as { type: string };
        if (msg.type === "ready") {
          setOrtReady(true);
          readyResolvers.current.forEach((r) => r());
          readyResolvers.current = [];
        }
      } catch {}
    }, []);

    const handleLoad = useCallback(() => {
      // Ping WebView to trigger ort load + ready signal
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(
          `(function(){var e=new MessageEvent('message',{data:'{"type":"ping"}'});window.dispatchEvent(e);})(); true;`
        );
      }, 300);
    }, []);

    useImperativeHandle(ref, () => ({
      async waitForOrtLib(): Promise<BridgeOrtLib> {
        if (!ortLibRef.current) {
          throw new Error("StemWebView not mounted");
        }
        if (!ortReady) {
          await new Promise<void>((resolve) => {
            readyResolvers.current.push(resolve);
          });
        }
        return ortLibRef.current;
      },
    }), [ortReady]);

    if (Platform.OS !== "android") return null;
    if (!htmlUri) return null;

    // htmlUri is already a full file:// URI (FileSystem.documentDirectory
    // includes the scheme) — do not prepend another "file://" or the WebView
    // rejects the resulting double-prefixed URL ("file://file:///...").
    const source = htmlUri === "__inline__"
      ? { html: STEM_WEBVIEW_HTML }
      : { uri: htmlUri };

    return (
      <WebView
        ref={webViewRef}
        source={source}
        style={{ width: 0, height: 0, position: "absolute", opacity: 0 }}
        javaScriptEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        originWhitelist={["*"]}
        onMessage={handleMessage}
        onLoad={handleLoad}
        onError={() => {}}
        androidLayerType="hardware"
      />
    );
  }
);
