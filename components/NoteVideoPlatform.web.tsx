import React, { useEffect, useRef } from "react";
import type { VideoPlayerCallbacks } from "./NoteVideoPlayer";
import type { VideoPhase } from "@/lib/note-video";

const fit = { width: "100%", height: "100%", minHeight: 200, display: "block", border: 0 } as const;

export function NoteVideoLocal({ uri, onDriver, onReading }: VideoPlayerCallbacks & { uri: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reading = useRef(onReading);
  reading.current = onReading;
  useEffect(() => {
    const element = ref.current!;
    let phase: VideoPhase = "loading";
    const sample = () => reading.current({
      phase, seconds: element.currentTime || 0,
      duration: Number.isFinite(element.duration) ? element.duration : 0, rate: element.playbackRate,
    });
    const events = {
      loadedmetadata: "ready", playing: "playing", pause: "paused", waiting: "buffering",
      seeking: "seeking", seeked: null, canplay: null, ended: "ended", error: "error",
    } as const;
    const listeners = Object.entries(events).map(([event, value]) => {
      const handle = () => {
        phase = value ?? (element.seeking ? "seeking" : element.paused ? "paused" : "playing");
        sample();
      };
      element.addEventListener(event, handle);
      return () => element.removeEventListener(event, handle);
    });
    const timer = setInterval(sample, 30);
    let attempt = 0;
    onDriver({
      play: () => {
        const token = ++attempt;
        void element.play().catch((error: DOMException) => {
          if (attempt === token) {
            phase = error.name === "NotAllowedError" ? "blocked" : "error";
            sample();
          }
        });
      },
      pause: () => { ++attempt; element.pause(); },
      seek: (seconds) => { element.currentTime = seconds; },
    });
    if (element.readyState >= 1) { phase = "ready"; sample(); }
    return () => {
      ++attempt;
      clearInterval(timer);
      listeners.forEach((remove) => remove());
      element.pause();
      onDriver(null);
    };
  }, [onDriver, uri]);
  return <video ref={ref} src={uri} playsInline preload="auto" style={{ ...fit, objectFit: "contain" }} />;
}

export function NoteVideoFrame({ html, origin, onDriver, onMessage }: {
  html: string; origin: string; onDriver: VideoPlayerCallbacks["onDriver"]; onMessage: (value: unknown) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const receive = useRef(onMessage);
  receive.current = onMessage;
  useEffect(() => {
    const send = (cmd: string, seconds?: number) => ref.current?.contentWindow?.postMessage({ cmd, seconds }, origin);
    const listener = (e: MessageEvent) => {
      if (e.source === ref.current?.contentWindow && e.origin === origin) receive.current(e.data);
    };
    window.addEventListener("message", listener);
    onDriver({ play: () => send("play"), pause: () => send("pause"), seek: (seconds) => send("seek", seconds) });
    return () => { window.removeEventListener("message", listener); onDriver(null); };
  }, [onDriver, origin]);
  return <iframe title="YouTube" ref={ref} srcDoc={html} allow="autoplay; encrypted-media; fullscreen" style={{ ...fit, position: "absolute", inset: 0 }} />;
}
