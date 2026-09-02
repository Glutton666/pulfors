"use no memo";
import React, { useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { Platform } from "react-native";
import { WebView } from "react-native-webview";
import type { RecognitionListener } from "@/lib/voice-recognition";

/**
 * HTML that runs Web Speech API (webkitSpeechRecognition) inside the WebView.
 * Auto-restarts after each "end" event while _voiceActive is true,
 * because Android's Web Speech API silently stops after a few seconds of silence.
 */
const SPEECH_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>
var rec=null,curLang="ko-KR";
window._voiceActive=false;
function startRec(){
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){window.ReactNativeWebView.postMessage(JSON.stringify({type:"error",error:"unsupported"}));return;}
  if(rec){try{rec.abort();}catch(ex){} rec=null;}
  rec=new SR();
  rec.continuous=true;
  rec.interimResults=true;
  rec.lang=curLang;
  rec.onstart=function(){window.ReactNativeWebView.postMessage(JSON.stringify({type:"start"}));};
  rec.onend=function(){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:"end"}));
    if(window._voiceActive){setTimeout(function(){if(window._voiceActive)startRec();},400);}
  };
  rec.onerror=function(e){
    var err=e.error||"unknown";
    window.ReactNativeWebView.postMessage(JSON.stringify({type:"error",error:err}));
    if(err==="no-speech"||err==="audio-capture"){
      if(window._voiceActive){setTimeout(function(){if(window._voiceActive)startRec();},400);}
    }
  };
  rec.onresult=function(e){
    var r=e.results[e.resultIndex];
    if(!r)return;
    var a=r[0];
    if(!a)return;
    window.ReactNativeWebView.postMessage(JSON.stringify({type:"result",transcript:a.transcript,isFinal:r.isFinal,confidence:a.confidence||0}));
  };
  try{rec.start();}catch(ex){}
}
window.voiceStart=function(lang){
  curLang=lang||curLang;
  window._voiceActive=true;
  startRec();
};
window.voiceStop=function(){
  window._voiceActive=false;
  if(rec){try{rec.abort();}catch(ex){} rec=null;}
};
<\/script></body></html>`;

export interface SpeechWebViewHandle {
  start: (lang: string) => void;
  stop: () => void;
}

interface Props {
  onEvent: RecognitionListener;
  onReady?: () => void;
}

export const SpeechWebView = forwardRef<SpeechWebViewHandle, Props>(({ onEvent, onReady }, ref) => {
  const webViewRef = useRef<WebView | null>(null);

  useImperativeHandle(ref, () => ({
    start(lang: string) {
      webViewRef.current?.injectJavaScript(
        `window.voiceStart&&window.voiceStart(${JSON.stringify(lang)});true;`,
      );
    },
    stop() {
      webViewRef.current?.injectJavaScript("window.voiceStop&&window.voiceStop();true;");
    },
  }));

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as {
          type: string;
          transcript?: string;
          isFinal?: boolean;
          confidence?: number;
          error?: string;
        };
        if (data.type === "result") {
          onEvent({
            type: "result",
            result: {
              transcript: data.transcript ?? "",
              isFinal: Boolean(data.isFinal),
              confidence: Number(data.confidence ?? 0),
            },
          });
        } else if (data.type === "error") {
          onEvent({ type: "error", error: String(data.error ?? "unknown") });
        } else if (data.type === "start") {
          onEvent({ type: "start" });
        } else if (data.type === "end") {
          onEvent({ type: "end" });
        }
      } catch {}
    },
    [onEvent],
  );

  if (Platform.OS !== "android") return null;

  return (
    <WebView
      ref={webViewRef}
      source={{ html: SPEECH_HTML }}
      style={{ width: 0, height: 0, position: "absolute", opacity: 0 }}
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      javaScriptEnabled
      onMessage={handleMessage}
      onLoadEnd={onReady}
      androidLayerType="hardware"
      mediaCapturePermissionGrantType="grant"
      allowFileAccess={false}
    />
  );
});
SpeechWebView.displayName = "SpeechWebView";
