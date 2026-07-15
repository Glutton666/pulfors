/**
 * stem-webview-bridge.ts
 *
 * WebView 기반 OrtLib 구현.
 * onnxruntime-web (WASM) 을 숨긴 WebView 안에서 실행하고,
 * postMessage / onMessage 로 RN ↔ WebView IPC 를 처리합니다.
 *
 * 사용:
 *   const lib = createWebViewOrtLib(sendFn, subscribeFn);
 *   await runStemSeparation(uri, name, cfg, onProgress, signal, lib);
 */

// ---------------------------------------------------------------------------
// HTML — file:// 로 로드되어 onnxruntime-web WASM 을 실행합니다.
// 모델도 file:// URI 로 fetch 합니다 (allowFileAccess 필요).
// ---------------------------------------------------------------------------

const ORT_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist";

export const STEM_WEBVIEW_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<script>
// ort.js + wasm 을 CDN 에서 로드
(function(){
  var s=document.createElement('script');
  s.src='${ORT_CDN}/ort.min.js';
  s.onload=function(){
    // 단일 스레드 WASM — SharedArrayBuffer 불필요
    ort.env.wasm.numThreads=1;
    ort.env.wasm.wasmPaths='${ORT_CDN}/';
    window._ortReady=true;
  };
  s.onerror=function(){ window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'fatal',message:'ort.js CDN load failed'})); };
  document.head.appendChild(s);
})();
</script>
</head><body><script>
var sessions={};
var cbPending={};

function rn(obj){ window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(obj)); }

function b64ToF32(b64){
  var bin=atob(b64),len=bin.length,buf=new Uint8Array(len);
  for(var i=0;i<len;i++) buf[i]=bin.charCodeAt(i);
  return new Float32Array(buf.buffer);
}
function f32ToB64(arr){
  var bytes=new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength);
  var s='';
  var chunk=65536;
  for(var i=0;i<bytes.length;i+=chunk){
    s+=String.fromCharCode.apply(null,bytes.subarray(i,i+chunk));
  }
  return btoa(s);
}

async function waitOrt(){
  var t=0;
  while(!window._ortReady&&t<200){ await new Promise(function(r){setTimeout(r,100);}); t++; }
  if(!window._ortReady) throw new Error('onnxruntime-web not loaded');
}

async function onMsg(e){
  var msg;
  try{ msg=JSON.parse(e.data); } catch{ return; }
  try{
    if(msg.type==='ping'){
      await waitOrt();
      rn({type:'ready'});

    } else if(msg.type==='create_session'){
      await waitOrt();
      var resp=await fetch(msg.modelUri);
      if(!resp.ok) throw new Error('model fetch failed: '+resp.status);
      var buf=await resp.arrayBuffer();
      var sess=await ort.InferenceSession.create(buf,{
        executionProviders:['wasm'],
        graphOptimizationLevel:'all'
      });
      sessions[msg.sessionId]=sess;
      rn({type:'session_created',sessionId:msg.sessionId,
          inputNames:Array.from(sess.inputNames),outputNames:Array.from(sess.outputNames)});

    } else if(msg.type==='run'){
      var sess=sessions[msg.sessionId];
      if(!sess) throw new Error('session not found');
      var feeds={};
      var entries=Object.entries(msg.feeds);
      for(var i=0;i<entries.length;i++){
        var name=entries[i][0],td=entries[i][1];
        feeds[name]=new ort.Tensor('float32',b64ToF32(td.data),td.dims);
      }
      var res=await sess.run(feeds);
      var out={};
      var rkeys=Object.keys(res);
      for(var i=0;i<rkeys.length;i++){
        var k=rkeys[i],t=res[k];
        out[k]={data:f32ToB64(t.data),dims:Array.from(t.dims)};
      }
      rn({type:'run_result',requestId:msg.requestId,output:out});

    } else if(msg.type==='release'){
      if(sessions[msg.sessionId]){ await sessions[msg.sessionId].release(); delete sessions[msg.sessionId]; }
    }
  } catch(err){
    rn({type:'error',requestId:msg&&msg.requestId,sessionId:msg&&msg.sessionId,message:err&&err.message||String(err)});
  }
}

document.addEventListener('message',onMsg);
window.addEventListener('message',onMsg);
<\/script></body></html>`;

// ---------------------------------------------------------------------------
// OrtLib bridge types (mirrors onnxruntime-react-native shape)
// ---------------------------------------------------------------------------

export interface BridgeTensor {
  data: Float32Array;
  dims: readonly number[];
  type: string;
}

export interface BridgeSession {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, BridgeTensor>): Promise<Record<string, BridgeTensor>>;
  release(): Promise<void>;
}

export interface BridgeOrtLib {
  InferenceSession: {
    create(
      modelUri: string,
      options?: { executionProviders?: string[]; graphOptimizationLevel?: string },
    ): Promise<BridgeSession>;
  };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => BridgeTensor;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function float32ToBase64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = "";
  const chunk = 65536;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function base64ToFloat32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

// ---------------------------------------------------------------------------
// Bridge factory
// ---------------------------------------------------------------------------

/**
 * sendMsg   — RN 측에서 WebView 로 문자열 메시지를 보내는 함수
 *             (보통 webViewRef.current?.injectJavaScript 또는 postMessage)
 * subscribe — WebView → RN 메시지 핸들러를 등록하고 해제 함수를 반환
 */
export function createWebViewOrtLib(
  sendMsg: (msg: string) => void,
  subscribe: (handler: (raw: string) => void) => () => void,
): BridgeOrtLib {
  type PendingCb = { resolve: (v: unknown) => void; reject: (e: Error) => void };
  const pending = new Map<string, PendingCb>();
  const sessionCallbacks = new Map<string, PendingCb>();

  // Register message listener
  subscribe((raw) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw) as Record<string, unknown>; } catch { return; }

    const type = msg.type as string;

    if (type === "run_result") {
      const cb = pending.get(msg.requestId as string);
      if (cb) { pending.delete(msg.requestId as string); cb.resolve(msg.output); }

    } else if (type === "session_created") {
      const cb = sessionCallbacks.get(msg.sessionId as string);
      if (cb) { sessionCallbacks.delete(msg.sessionId as string); cb.resolve(msg); }

    } else if (type === "error") {
      const reqId = msg.requestId as string | undefined;
      const sessId = msg.sessionId as string | undefined;
      const err = new Error((msg.message as string) ?? "WebView ORT error");
      if (reqId) {
        const cb = pending.get(reqId);
        if (cb) { pending.delete(reqId); cb.reject(err); }
      } else if (sessId) {
        const cb = sessionCallbacks.get(sessId);
        if (cb) { sessionCallbacks.delete(sessId); cb.reject(err); }
      }
    }
  });

  // Fake Tensor class — serialized on the fly in run()
  class BridgeTensorImpl implements BridgeTensor {
    type: string;
    data: Float32Array;
    dims: readonly number[];
    constructor(type: string, data: Float32Array, dims: number[]) {
      this.type = type;
      this.data = data;
      this.dims = dims;
    }
  }

  // Session wrapper
  class BridgeSessionImpl implements BridgeSession {
    inputNames: string[];
    outputNames: string[];
    constructor(
      private sessionId: string,
      inputNames: string[],
      outputNames: string[],
    ) {
      this.inputNames = inputNames;
      this.outputNames = outputNames;
    }

    async run(feeds: Record<string, BridgeTensor>): Promise<Record<string, BridgeTensor>> {
      const requestId = genId();
      const serializedFeeds: Record<string, { type: string; data: string; dims: number[] }> = {};
      for (const [name, tensor] of Object.entries(feeds)) {
        serializedFeeds[name] = {
          type: tensor.type,
          data: float32ToBase64(tensor.data),
          dims: Array.from(tensor.dims) as number[],
        };
      }

      const output = await new Promise<Record<string, { data: string; dims: number[] }>>(
        (resolve, reject) => {
          pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
          sendMsg(JSON.stringify({
            type: "run",
            requestId,
            sessionId: this.sessionId,
            feeds: serializedFeeds,
          }));
        },
      );

      const result: Record<string, BridgeTensor> = {};
      for (const [name, td] of Object.entries(output)) {
        result[name] = new BridgeTensorImpl("float32", base64ToFloat32(td.data), td.dims);
      }
      return result;
    }

    async release(): Promise<void> {
      sendMsg(JSON.stringify({ type: "release", sessionId: this.sessionId }));
    }
  }

  return {
    InferenceSession: {
      async create(modelUri: string): Promise<BridgeSession> {
        const sessionId = genId();
        const info = await new Promise<{ inputNames: string[]; outputNames: string[] }>(
          (resolve, reject) => {
            sessionCallbacks.set(sessionId, {
              resolve: resolve as (v: unknown) => void,
              reject,
            });
            sendMsg(JSON.stringify({ type: "create_session", sessionId, modelUri }));
          },
        );
        return new BridgeSessionImpl(sessionId, info.inputNames, info.outputNames);
      },
    },
    Tensor: BridgeTensorImpl,
  };
}
