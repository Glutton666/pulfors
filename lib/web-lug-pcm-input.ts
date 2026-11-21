export interface WebLugPcmInput {
  flush(): Promise<void>;
  close(): void;
}

const DRAIN_TIMEOUT_MS = 160;

/** Both inputs deliver real contiguous PCM; neither feeds mic audio to speakers. */
export async function openWebLugPcmInput(
  context: AudioContext,
  source: MediaStreamAudioSourceNode,
  options: {
    isCurrent(): boolean;
    onPcm(samples: Float32Array): void;
    onError(): void;
  },
): Promise<WebLugPcmInput | null> {
  let worklet: AudioWorkletNode | undefined;
  try {
    if (context.audioWorklet && typeof AudioWorkletNode === "function") {
      await context.audioWorklet.addModule("/audio-worklets/drum-lug-pcm.js");
      if (!options.isCurrent()) return null;
      const node = new AudioWorkletNode(context, "drum-lug-pcm", { channelCount: 1, channelCountMode: "explicit" });
      worklet = node;
      let onDrained: (() => void) | undefined;
      node.port.onmessage = ({ data }) => {
        if (data instanceof Float32Array) options.onPcm(data);
        else if (data === "drained") onDrained?.();
      };
      node.onprocessorerror = options.onError;
      source.connect(node);
      node.connect(context.destination);
      return {
        flush: () => new Promise<void>((resolve) => {
          const timer = setTimeout(() => onDrained?.(), DRAIN_TIMEOUT_MS);
          onDrained = () => {
            clearTimeout(timer);
            onDrained = undefined;
            resolve();
          };
          try { node.port.postMessage("drain"); } catch { onDrained(); }
        }),
        close: () => {
          onDrained?.();
          node.onprocessorerror = null;
          node.port.onmessage = null;
          node.port.close();
          try { source.disconnect(node); } catch {}
          node.disconnect();
        },
      };
    }
  } catch (workletError) {
    if (!options.isCurrent()) return null;
    if (worklet) {
      worklet.onprocessorerror = null;
      worklet.port.onmessage = null;
      worklet.port.close();
      try { source.disconnect(worklet); } catch {}
      worklet.disconnect();
    }
    if (typeof context.createScriptProcessor !== "function") throw workletError;
  }

  if (!options.isCurrent()) return null;
  if (typeof context.createScriptProcessor !== "function") {
    throw new Error("This browser does not expose continuous microphone PCM");
  }
  // Compatibility path for browsers where loading/starting a worklet is
  // unavailable. Unlike polling AnalyserNode, callbacks don't repeat samples.
  const node = context.createScriptProcessor(512, 1, 1);
  node.onaudioprocess = (event) => {
    event.outputBuffer.getChannelData(0).fill(0);
    options.onPcm(event.inputBuffer.getChannelData(0));
  };
  try {
    source.connect(node);
    node.connect(context.destination);
  } catch (error) {
    node.onaudioprocess = null;
    try { source.disconnect(node); } catch {}
    node.disconnect();
    throw error;
  }
  return {
    flush: () => Promise.resolve(),
    close: () => {
      node.onaudioprocess = null;
      try { source.disconnect(node); } catch {}
      node.disconnect();
    },
  };
}
