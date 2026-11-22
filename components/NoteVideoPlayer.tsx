import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { readVideoReading, type NoteVideoSource, type VideoDriver, type VideoReading } from "@/lib/note-video";
import { resolveNoteVideoFile } from "@/lib/note-video-files";
import { NoteVideoLocal, NoteVideoFrame } from "./NoteVideoPlatform";

export interface VideoPlayerCallbacks {
  onDriver: (driver: VideoDriver | null) => void;
  onReading: (reading: VideoReading) => void;
}

// Only the validated video ID and our own origin enter this document.
function frameHtml(id: string, origin: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>html,body,#player,iframe{width:100%;height:100%;margin:0;background:#000;border:0;display:block}</style>
  </head><body><div id="player"></div><script>
  let p, failed='', ready=false, wasPlaying=false, seeking=false;
  const send=(phase)=>{
    const data={phase,seconds:Number(p?.getCurrentTime?.())||0,duration:Number(p?.getDuration?.())||0,rate:Number(p?.getPlaybackRate?.())||1};
    if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(data));
    else window.parent.postMessage(data,${JSON.stringify(origin)});
  };
  const sample=()=>{
    if(failed){send(failed);return}
    if(!ready)return;
    const state=p.getPlayerState();
    if(seeking && state===1)seeking=false;
    send(seeking?'seeking':state===1?'playing':state===3?'buffering':state===0?'ended':state===2?'paused':'ready');
  };
  window.noteVideoCommand=(msg)=>{
    if(!ready||!msg)return;
    if(msg.cmd==='seek' && Number.isFinite(msg.seconds)){
      seeking=true; send('seeking');
      p.seekTo(msg.seconds,true);
      if(!wasPlaying)p.pauseVideo();
      setTimeout(()=>{seeking=false;sample()},300);
    }
    if(msg.cmd==='pause'){wasPlaying=false;p.pauseVideo()}
    if(msg.cmd==='play'){failed='';wasPlaying=true;p.playVideo()}
  };
  window.addEventListener('message',(event)=>{
    if(event.source===window.parent && event.origin===${JSON.stringify(origin)})window.noteVideoCommand(event.data);
  });
  window.onYouTubeIframeAPIReady=()=>{
    p=new YT.Player('player',{videoId:${JSON.stringify(id)},playerVars:{playsinline:1,rel:0,origin:${JSON.stringify(origin)}},
      events:{
        onReady:()=>{ready=true;send('ready');setInterval(sample,50)},
        onStateChange:(e)=>{if(e.data===1){failed='';wasPlaying=true}else if(e.data===2||e.data===0)wasPlaying=false;sample()},
        onError:()=>{failed='error';send(failed)},
        onAutoplayBlocked:()=>{failed='blocked';send(failed)}
      }});
  };
  setTimeout(()=>{if(!ready&&!failed){failed='error';send(failed)}},15000);
  </script><script src="https://www.youtube.com/iframe_api" onerror="failed='error';send(failed)"></script></body></html>`;
}

export function NoteVideoPlayer({ source, onDriver, onReading }: VideoPlayerCallbacks & { source: NoteVideoSource }) {
  const [resolved, setResolved] = useState<{ id: string; uri: string } | null>(null);
  const callbacks = useRef({ onDriver, onReading });
  callbacks.current = { onDriver, onReading };
  const assetId = source.kind === "file" ? source.assetId : null;
  useEffect(() => {
    if (!assetId) return;
    let active = true;
    let release = () => {};
    void resolveNoteVideoFile(assetId).then((file) => {
      if (!active) { file.release(); return; }
      release = file.release;
      setResolved({ id: assetId, uri: file.uri });
    }).catch(() => {
      if (active) callbacks.current.onReading({ phase: "error", seconds: 0, duration: 0, rate: 1 });
    });
    return () => { active = false; release(); };
  }, [assetId]);

  const id = source.kind === "youtube" ? source.videoId : null;
  const origin = Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.origin
    : "https://com.pulfors.app";
  const html = useMemo(() => id ? frameHtml(id, origin) : null, [id, origin]);
  const receive = (value: unknown) => {
    const reading = readVideoReading(value);
    if (reading) onReading(reading);
  };
  return <View style={styles.frame} testID="note-video-player">
    {html && id ? <NoteVideoFrame key={id} html={html} origin={origin} onDriver={onDriver} onMessage={receive} />
      : resolved && assetId === resolved.id
        ? <NoteVideoLocal key={assetId} uri={resolved.uri} onDriver={onDriver} onReading={onReading} />
        : null}
  </View>;
}

const styles = StyleSheet.create({
  frame: { backgroundColor: "#080a0e", minHeight: 200, borderRadius: 12, overflow: "hidden", width: "100%", flex: 1 },
});
