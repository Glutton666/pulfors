"use no memo";
import React, { useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { Platform } from "react-native";
import { WebView } from "react-native-webview";
import { captureBreadcrumb } from "@/lib/error-tracking";

const MIC_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>
var running=false,audioCtx,analyser,source,stream,raf,retryCount=0,MAX_RETRIES=3;
var NOTE_NAMES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function freqToNote(f){if(!f||f<20)return null;var n=12*Math.log2(f/440)+69;var idx=Math.round(n)%12;if(idx<0)idx+=12;var oct=Math.floor(Math.round(n)/12)-1;return NOTE_NAMES[idx]+oct;}
function autoCorr(buf,sr){var sz=buf.length,best=0,bestR=-1,rms=0;for(var i=0;i<sz;i++)rms+=buf[i]*buf[i];rms=Math.sqrt(rms/sz);if(rms<0.01){window.ReactNativeWebView.postMessage(JSON.stringify({type:"freq",frequency:null,note:null}));return;}
var minP=Math.floor(sr/2000),maxP=Math.floor(sr/50);for(var p=minP;p<maxP;p++){var sum=0;for(var i=0;i<sz-p;i++)sum+=buf[i]*buf[i+p];var r=sum/(sz-p);if(r>bestR){bestR=r;best=p;}}
if(best>0){var y1=0,y2=0,y3=0;for(var i=0;i<sz-(best-1);i++)y1+=buf[i]*buf[i+best-1];y1/=(sz-best+1);for(var i=0;i<sz-best;i++)y2+=buf[i]*buf[i+best];y2/=(sz-best);for(var i=0;i<sz-(best+1);i++)y3+=buf[i]*buf[i+best+1];y3/=(sz-best-1);
var a=(y1+y3-2*y2)/2,b=(y3-y1)/2;var shift=a!==0?-b/(2*a):0;var freq=sr/(best+shift);if(freq>20&&freq<5000){window.ReactNativeWebView.postMessage(JSON.stringify({type:"freq",frequency:Math.round(freq*10)/10,note:freqToNote(freq)}));}else{window.ReactNativeWebView.postMessage(JSON.stringify({type:"freq",frequency:null,note:null}));}}
else{window.ReactNativeWebView.postMessage(JSON.stringify({type:"freq",frequency:null,note:null}));}}
async function startMic(){if(running)return;running=true;try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});audioCtx=new(window.AudioContext||window.webkitAudioContext)();analyser=audioCtx.createAnalyser();analyser.fftSize=4096;source=audioCtx.createMediaStreamSource(stream);source.connect(analyser);retryCount=0;var buf=new Float32Array(analyser.fftSize);function detect(){if(!running)return;analyser.getFloatTimeDomainData(buf);autoCorr(buf,audioCtx.sampleRate);raf=requestAnimationFrame(detect);}detect();}catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:"error",message:e.message||"mic_failed"}));if(retryCount<MAX_RETRIES){retryCount++;running=false;setTimeout(startMic,1000);}}}
window.stopMic=function(){running=false;if(raf)cancelAnimationFrame(raf);if(source)source.disconnect();if(audioCtx)audioCtx.close();if(stream)stream.getTracks().forEach(function(t){t.stop();});};
startMic();
<\/script></body></html>`;

export interface MicWebViewHandle {
  stop: () => void;
}

interface MicWebViewProps {
  onFrequency: (frequency: number | null, note: string | null) => void;
}

export const MicWebView = forwardRef<MicWebViewHandle, MicWebViewProps>(
  ({ onFrequency }, ref) => {
    const webViewRef = useRef<WebView | null>(null);

    useImperativeHandle(ref, () => ({
      stop: () => {
        webViewRef.current?.injectJavaScript("window.stopMic && window.stopMic(); true;");
      },
    }));

    const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === "freq") {
          onFrequency(data.frequency, data.note);
        } else if (data.type === "error") {
          captureBreadcrumb({
            category: "micWebView",
            message: "WebView mic error",
            level: "warning",
            data: { error: String(data.message ?? "unknown") },
          });
        }
      } catch {}
    }, [onFrequency]);

    if (Platform.OS !== "android") return null;

    return (
      <WebView
        ref={webViewRef}
        source={{ html: MIC_HTML }}
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
  }
);
