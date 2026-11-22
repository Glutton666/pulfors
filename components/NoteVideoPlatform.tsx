import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import WebView from "react-native-webview";
import type { VideoPlayerCallbacks } from "./NoteVideoPlayer";
import type { VideoPhase } from "@/lib/note-video";

export function NoteVideoLocal({ uri, onDriver, onReading }: VideoPlayerCallbacks & { uri: string }) {
  // The video and the app's own metronome need to be audible together.
  const player = useVideoPlayer(null, (p) => {
    p.audioMixingMode = "mixWithOthers";
    p.allowsExternalPlayback = false;
  });
  const receive = useRef(onReading);
  receive.current = onReading;
  useEffect(() => {
    let active = true;
    let ended = false;
    const sample = (override?: VideoPhase) => {
      if (!active) return;
      const phase: VideoPhase = override ?? (player.status === "error" ? "error" :
        ended ? "ended" : player.status === "loading" ? "buffering" :
        player.status === "idle" ? "loading" : player.playing ? "playing" : "paused");
      receive.current({ phase, seconds: player.currentTime || 0, duration: player.duration || 0, rate: player.playbackRate || 1 });
    };
    let seekUntil = 0;
    const samplePlayer = () => Date.now() < seekUntil ? sample("seeking") : sample();
    const subscriptions = [
      player.addListener("statusChange", () => samplePlayer()),
      player.addListener("playingChange", () => samplePlayer()),
      player.addListener("playToEnd", () => { ended = true; sample("ended"); }),
    ];
    const timer = setInterval(samplePlayer, 40);
    onDriver({
      play: () => { ended = false; player.play(); },
      pause: () => player.pause(),
      seek: (seconds) => { ended = false; seekUntil = Date.now() + 150; sample("seeking"); player.currentTime = seconds; },
    });
    void player.replaceAsync(uri).catch(() => sample("error"));
    return () => {
      active = false;
      clearInterval(timer);
      subscriptions.forEach((sub) => sub.remove());
      onDriver(null);
    };
  }, [onDriver, player, uri]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} fullscreenOptions={{ enable: false }} surfaceType="textureView" />;
}

export function NoteVideoFrame({ html, origin, onDriver, onMessage }: {
  html: string; origin: string; onDriver: VideoPlayerCallbacks["onDriver"]; onMessage: (value: unknown) => void;
}) {
  const ref = useRef<WebView>(null);
  const source = useMemo(() => ({ html, baseUrl: `${origin}/` }), [html, origin]);
  useEffect(() => {
    const send = (cmd: string, seconds?: number) =>
      ref.current?.injectJavaScript(`window.noteVideoCommand?.(${JSON.stringify({ cmd, seconds })}); true;`);
    onDriver({ play: () => send("play"), pause: () => send("pause"), seek: (seconds) => send("seek", seconds) });
    return () => onDriver(null);
  }, [onDriver]);
  return <WebView ref={ref} source={source} originWhitelist={[origin, "about:blank", "https://www.youtube.com"]}
    allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} scrollEnabled={false}
    onShouldStartLoadWithRequest={(request) => !request.isTopFrame || request.url === "about:blank" || request.url === `${origin}/`}
    onMessage={({ nativeEvent }) => { try { onMessage(JSON.parse(nativeEvent.data)); } catch {} }}
    style={{ backgroundColor: "#080a0e" }} />;
}
