"use no memo";
import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { WebView } from "react-native-webview";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { AnimatedModal } from "@/components/AnimatedModal";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useScale } from "@/lib/scale";
import { useModalCardLayout } from "@/lib/modal-layout";
import { ensurePermission } from "@/lib/permissions";
import { detectBpm } from "@/lib/bpm-detect";
import { Radius, FontSize, Spacing } from "@/constants/tokens";

// ─── BPM detect WebView HTML (iOS + Android) ─────────────────────────────────
const BPM_HTML = `<!DOCTYPE html><html><body><script>
var running=true,audioCtx,source,stream,analyser,samples=[],SR,WS=1024,HS=512;
function dB(pcm,sr){var fr=[],i,j,e;for(i=0;i+WS<=pcm.length;i+=HS){e=0;for(j=0;j<WS;j++)e+=pcm[i+j]*pcm[i+j];fr.push(Math.sqrt(e/WS));}if(fr.length<8)return null;var mx=0;for(i=0;i<fr.length;i++)if(fr[i]>mx)mx=fr[i];if(mx<0.001)return null;var on=[0];for(i=1;i<fr.length;i++)on.push(Math.max(0,fr[i]-fr[i-1]));var hr=sr/HS,mL=Math.round(60/250*hr),xL=Math.round(60/50*hr);if(xL>=on.length)return null;var bv=-Infinity,bl=mL,s,n;for(var lag=mL;lag<=xL;lag++){s=0;n=on.length-lag;for(i=0;i<n;i++)s+=on[i]*on[i+lag];var a=s/n;if(a>bv){bv=a;bl=lag;}}if(bv<=0)return null;var b=Math.round(60*hr/bl);return(b>=50&&b<=250)?b:null;}
function post(d){try{window.ReactNativeWebView.postMessage(JSON.stringify(d));}catch(e){}}
async function go(){try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});audioCtx=new(window.AudioContext||window.webkitAudioContext)();SR=audioCtx.sampleRate;analyser=audioCtx.createAnalyser();analyser.fftSize=2048;source=audioCtx.createMediaStreamSource(stream);source.connect(analyser);var buf=new Float32Array(analyser.fftSize),t0=Date.now();function tick(){if(!running)return;analyser.getFloatTimeDomainData(buf);for(var i=0;i<buf.length;i++)samples.push(buf[i]);var el=(Date.now()-t0)/1000,p=Math.min(el/10,1);post({type:"bpm_progress",progress:p});if(el>=10)finish();else setTimeout(tick,50);}tick();}catch(e){post({type:"bpm_error",message:String(e.message||e)});}}
function finish(){running=false;try{if(stream)stream.getTracks().forEach(function(t){t.stop();});}catch(e){}try{if(audioCtx)audioCtx.close();}catch(e){}var bpm=dB(new Float32Array(samples),SR||44100);post({type:"bpm_result",bpm:bpm});}
window.stopBpmDetect=function(){running=false;try{if(stream)stream.getTracks().forEach(function(t){t.stop();});}catch(e){}try{if(audioCtx)audioCtx.close();}catch(e){}};
go();
<\/script></body></html>`;

// ─── Hidden WebView for native BPM detection ─────────────────────────────────
interface BpmDetectWebViewHandle {
  stop: () => void;
}
interface BpmDetectWebViewProps {
  onProgress: (progress: number) => void;
  onResult: (bpm: number | null) => void;
  onError: (msg: string) => void;
}
const BpmDetectWebView = forwardRef<BpmDetectWebViewHandle, BpmDetectWebViewProps>(
  ({ onProgress, onResult, onError }, ref) => {
    const wvRef = useRef<WebView | null>(null);

    useImperativeHandle(ref, () => ({
      stop: () => {
        wvRef.current?.injectJavaScript("window.stopBpmDetect && window.stopBpmDetect(); true;");
      },
    }));

    const handleMessage = useCallback(
      (event: { nativeEvent: { data: string } }) => {
        try {
          const d = JSON.parse(event.nativeEvent.data);
          if (d.type === "bpm_progress") onProgress(d.progress ?? 0);
          else if (d.type === "bpm_result") onResult(d.bpm ?? null);
          else if (d.type === "bpm_error") onError(d.message ?? "unknown");
        } catch {}
      },
      [onProgress, onResult, onError],
    );

    if (Platform.OS === "web") return null;

    return (
      <WebView
        ref={wvRef}
        source={{ html: BPM_HTML }}
        style={{ width: 0, height: 0, position: "absolute", opacity: 0 }}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        javaScriptEnabled
        onMessage={handleMessage}
        androidLayerType="hardware"
        mediaCapturePermissionGrantType="grant"
        allowFileAccess={false}
      />
    );
  },
);

// ─── Main modal ───────────────────────────────────────────────────────────────
type Phase = "requesting" | "listening" | "result" | "error";

interface BpmDetectModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (bpm: number) => void;
}

export function BpmDetectModal({ visible, onClose, onApply }: BpmDetectModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const S = useScale();
  const layout = useModalCardLayout({ maxWidth: 400 });
  const styles = makeStyles(C, S);

  const [phase, setPhase] = useState<Phase>("requesting");
  const [progress, setProgress] = useState(0);
  const [detectedBpm, setDetectedBpm] = useState<number | null>(null);
  const [adjustedBpm, setAdjustedBpm] = useState(120);
  const [errorMsg, setErrorMsg] = useState<"quiet" | "failed">("failed");

  const webViewRef = useRef<BpmDetectWebViewHandle | null>(null);
  // Web-only refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const samplesRef = useRef<number[]>([]);
  const listeningRef = useRef(false);
  const cancelledRef = useRef(false);

  const progressWidth = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value * 100}%`,
  }));

  const updateProgress = useCallback((p: number) => {
    setProgress(p);
    progressWidth.value = withTiming(p, { duration: 150 });
  }, [progressWidth]);

  const handleResult = useCallback((bpm: number | null) => {
    if (cancelledRef.current) return;
    if (bpm === null) {
      setErrorMsg("quiet");
      setPhase("error");
    } else {
      setDetectedBpm(bpm);
      setAdjustedBpm(bpm);
      setPhase("result");
    }
  }, []);

  const handleWebError = useCallback(() => {
    if (!cancelledRef.current) {
      setErrorMsg("failed");
      setPhase("error");
    }
  }, []);

  // Web Audio API detection (web only)
  const startWebDetection = useCallback(async () => {
    if (Platform.OS !== "web") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (cancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      samplesRef.current = [];
      const buf = new Float32Array(analyser.fftSize);
      const startTime = Date.now();

      const tick = () => {
        if (!listeningRef.current || cancelledRef.current) return;
        analyser.getFloatTimeDomainData(buf);
        for (let i = 0; i < buf.length; i++) samplesRef.current.push(buf[i]);
        const elapsed = (Date.now() - startTime) / 1000;
        updateProgress(Math.min(elapsed / 10, 1));
        if (elapsed >= 10) {
          // cleanup
          stream.getTracks().forEach((t) => t.stop());
          try { ctx.close(); } catch {}
          const pcm = new Float32Array(samplesRef.current);
          handleResult(detectBpm(pcm, ctx.sampleRate));
        } else {
          setTimeout(tick, 50);
        }
      };
      tick();
    } catch {
      handleWebError();
    }
  }, [updateProgress, handleResult, handleWebError]);

  const stopWebDetection = useCallback(() => {
    listeningRef.current = false;
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    try { audioCtxRef.current?.close(); } catch {}
  }, []);

  // Start detection flow
  const startDetection = useCallback(async () => {
    cancelledRef.current = false;
    listeningRef.current = true;
    updateProgress(0);
    setPhase("requesting");

    const granted = await ensurePermission("mic", t, { showAlertOnDeny: true });
    if (!granted || cancelledRef.current) {
      setErrorMsg("failed");
      setPhase("error");
      return;
    }
    setPhase("listening");

    if (Platform.OS === "web") {
      startWebDetection();
    }
    // Native: BpmDetectWebView starts automatically via its HTML
  }, [t, updateProgress, startWebDetection]);

  // Kick off when modal opens
  useEffect(() => {
    if (!visible) return;
    setDetectedBpm(null);
    setAdjustedBpm(120);
    setProgress(0);
    progressWidth.value = 0;
    startDetection();
    return () => {
      cancelledRef.current = true;
      listeningRef.current = false;
      stopWebDetection();
      webViewRef.current?.stop();
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    cancelledRef.current = true;
    listeningRef.current = false;
    stopWebDetection();
    webViewRef.current?.stop();
    onClose();
  }, [stopWebDetection, onClose]);

  const handleApply = useCallback(() => {
    onApply(adjustedBpm);
    handleClose();
  }, [adjustedBpm, onApply, handleClose]);

  const nudge = useCallback((delta: number) => {
    setAdjustedBpm((prev) => Math.max(20, Math.min(300, prev + delta)));
  }, []);

  return (
    <AnimatedModal visible={visible} transparent onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={[styles.sheet, { backgroundColor: C.surface, borderColor: C.border, maxWidth: layout.cardWidth, maxHeight: layout.cardMaxHeight }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: C.text }]}>{t("bpmDetect", "title")}</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Ionicons name="close" size={S.ms(22, 0.3)} color={C.textSecondary} />
            </Pressable>
          </View>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.lg }}>

          {/* Status area */}
          {phase === "requesting" && (
            <View style={styles.statusRow}>
              <ActivityIndicator color={C.accent} />
              <Text style={[styles.statusText, { color: C.textSecondary }]}>
                {t("bpmDetect", "requesting")}
              </Text>
            </View>
          )}

          {phase === "listening" && (
            <View style={styles.listenArea}>
              <View style={styles.micRow}>
                <Ionicons name="mic" size={S.ms(28, 0.3)} color={C.accent} />
                <Text style={[styles.statusText, { color: C.text }]}>
                  {t("bpmDetect", "listening")}
                </Text>
              </View>
              <Text style={[styles.hint, { color: C.textSecondary }]}>
                {t("bpmDetect", "listenHint")}
              </Text>

              {/* Progress bar */}
              <View style={[styles.progressTrack, { backgroundColor: C.border }]}>
                <Animated.View style={[styles.progressFill, { backgroundColor: C.accent }, progressStyle]} />
              </View>
              <Text style={[styles.progressLabel, { color: C.textSecondary }]}>
                {Math.round(progress * 10)}/10s
              </Text>
            </View>
          )}

          {phase === "result" && detectedBpm !== null && (
            <View style={styles.resultArea}>
              <Text style={[styles.resultLabel, { color: C.textSecondary }]}>
                {t("bpmDetect", "detected")}
              </Text>
              <Text style={[styles.resultBpm, { color: C.accent }]}>{adjustedBpm} BPM</Text>

              {/* Fine-tune buttons */}
              <View style={styles.nudgeRow}>
                {([-5, -1, 1, 5] as const).map((d) => (
                  <Pressable
                    key={d}
                    style={({ pressed }) => [
                      styles.nudgeBtn,
                      { borderColor: C.border, backgroundColor: pressed ? C.accent + "22" : "transparent" },
                    ]}
                    onPress={() => nudge(d)}
                    accessibilityLabel={`${d > 0 ? "+" : ""}${d}`}
                  >
                    <Text style={[styles.nudgeText, { color: C.text }]}>
                      {d > 0 ? `+${d}` : `${d}`}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Buttons */}
              <View style={styles.actionRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.cancelBtn,
                    { borderColor: C.border },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={handleClose}
                >
                  <Text style={[styles.cancelText, { color: C.textSecondary }]}>
                    {t("bpmDetect", "cancel")}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.applyBtn,
                    { backgroundColor: C.accent },
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={handleApply}
                >
                  <Text style={styles.applyText}>{t("bpmDetect", "apply")}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {phase === "error" && (
            <View style={styles.errorArea}>
              <Ionicons name="alert-circle-outline" size={S.ms(36, 0.3)} color={C.textSecondary} />
              <Text style={[styles.errorText, { color: C.textSecondary }]}>
                {errorMsg === "quiet" ? t("bpmDetect", "tooQuiet") : t("bpmDetect", "failed")}
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.retryBtn,
                  { backgroundColor: C.accent },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => startDetection()}
              >
                <Text style={styles.applyText}>{t("bpmDetect", "retry")}</Text>
              </Pressable>
            </View>
          )}
          </ScrollView>
        </Pressable>
      </Pressable>

      {/* Hidden WebView for native BPM detection */}
      {Platform.OS !== "web" && phase === "listening" && (
        <BpmDetectWebView
          ref={webViewRef}
          onProgress={updateProgress}
          onResult={handleResult}
          onError={() => { setErrorMsg("failed"); setPhase("error"); }}
        />
      )}
    </AnimatedModal>
  );
}

const makeStyles = (C: any, S: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: Spacing.xl,
    },
    sheet: {
      width: "100%",
      maxWidth: S.isTablet ? 520 : 400,
      borderRadius: Radius.xl,
      borderWidth: 1,
      padding: Spacing.xl,
      gap: Spacing.lg,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    title: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: FontSize.subtitle,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.md,
      paddingVertical: Spacing.md,
    },
    statusText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
    },
    listenArea: {
      gap: Spacing.md,
      alignItems: "center",
    },
    micRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.sm,
    },
    hint: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
      textAlign: "center",
    },
    progressTrack: {
      width: "100%",
      height: 6,
      borderRadius: 3,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 3,
    },
    progressLabel: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
    },
    resultArea: {
      alignItems: "center",
      gap: Spacing.lg,
    },
    resultLabel: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
    },
    resultBpm: {
      fontFamily: "SpaceGrotesk_700Bold",
      fontSize: 48,
    },
    nudgeRow: {
      flexDirection: "row",
      gap: Spacing.sm,
    },
    nudgeBtn: {
      borderWidth: 1,
      borderRadius: Radius.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      minWidth: 48,
      alignItems: "center",
    },
    nudgeText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    actionRow: {
      flexDirection: "row",
      gap: Spacing.md,
      width: "100%",
    },
    cancelBtn: {
      flex: 1,
      borderWidth: 1,
      borderRadius: Radius.md,
      paddingVertical: Spacing.md,
      alignItems: "center",
    },
    cancelText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
    },
    applyBtn: {
      flex: 2,
      borderRadius: Radius.md,
      paddingVertical: Spacing.md,
      alignItems: "center",
    },
    applyText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
      color: "#fff",
    },
    errorArea: {
      alignItems: "center",
      gap: Spacing.md,
      paddingVertical: Spacing.md,
    },
    errorText: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.body,
      textAlign: "center",
    },
    retryBtn: {
      borderRadius: Radius.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xl,
    },
  });
