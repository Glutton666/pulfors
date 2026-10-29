import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { DEFAULT_NOTEBOOK_SETTINGS, type StaffNotebook } from "@/lib/staff-notebook";
import { notebookRows, type NotebookRow } from "@/lib/staff-notebook-layout";
import { buildNotebookPlan, notebookPosition, type NotebookBar } from "@/lib/notebook-playback-plan";
import { getNotebookPatternSchedule, renderNotebookPatternPCM } from "@/lib/audio-export";
import { getWebAudioContext, playWebRenderedLoop, releaseRenderedWav, saveRenderedWav } from "@/lib/audio-renderer";
import type { PracticeEntry } from "@/lib/storage";

let fileId = 0;
export function useNotebookPlayback(note: StaffNotebook, active: boolean) {
  const [running, setRunning] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<NotebookRow[]>([]);
  const [position, setPosition] = useState({ row: 0, progress: 0 });
  const owner = useRef(0);
  const dispose = useRef<() => void>(() => {});
  const abort = useRef<AbortController | null>(null);
  const latest = useRef(note); latest.current = note;
  const stop = useCallback(() => {
    owner.current++; abort.current?.abort(); abort.current = null;
    dispose.current(); dispose.current = () => {};
    setRunning(false); setPreparing(false);
  }, []);
  const start = useCallback(async (input?: StaffNotebook) => {
    stop(); setError(""); setPreparing(true);
    const generation = owner.current, controller = new AbortController();
    abort.current = controller;
    const valid = () => owner.current === generation && !controller.signal.aborted;
    const check = () => { if (!valid()) throw new Error("CANCELLED"); };
    let cleanup = () => {};
    const own = (action: () => void) => {
      let released = false;
      cleanup = () => { if (!released) { released = true; action(); } };
      if (valid()) dispose.current = cleanup;
    };
    try {
      // Resume in the initiating gesture, before asynchronous preparation.
      const ctx = Platform.OS === "web" ? getWebAudioContext() : null;
      if (ctx?.state === "suspended") await ctx.resume();
      check();
      const snapshot = input ?? latest.current;
      const settings = { ...DEFAULT_NOTEBOOK_SETTINGS, ...snapshot.settings };
      const continuousClick = !settings.source;
      const simple: PracticeEntry = {
        id: "notebook-click", label: "1/4", createdAt: 0, mode: "beat",
        bpm: settings.bpm, beatsPerMeasure: 1, beatTypes: ["normal"],
        beatSubdivisions: {}, barRepeats: {}, barLoopMode: "once", subdivisionPattern: [],
      };
      const source = settings.source ?? simple;
      const inputs = [source];
      if (!inputs.length || inputs.some((entry) => entry.scoreId || entry.rhythmDocument ||
        entry.mode && !["beat", "bar"].includes(entry.mode))) throw new Error("UNSUPPORTED_PATTERN");
      const rendered: ReturnType<typeof getNotebookPatternSchedule>[] = [];
      const bars: NotebookBar[] = [];
      for (const entry of inputs) {
        check();
        const audio = getNotebookPatternSchedule(entry);
        check();
        const sourceIndex = rendered.length; rendered.push(audio);
        if (entry.mode !== "bar") {
          bars.push({ source: sourceIndex, startMs: 0, endMs: audio.durationMs });
        } else {
          const main = audio.ticks.filter((tick) => (tick.layerIndex ?? 0) === 0 && tick.subBeat === 0);
          const starts = main.filter((tick, index) => !index || Math.abs(tick.time - main[index - 1].time) > 0.01);
          starts.forEach((tick, index) => {
            const root = (entry.loopBlocks ?? []).map((block, i) => ({ block, i }))
              .filter(({ block }) => block.layerOf === undefined && tick.beat >= block.startBeat && tick.beat <= block.endBeat)
              .sort((a, b) => (b.block.endBeat - b.block.startBeat) - (a.block.endBeat - a.block.startBeat))[0];
            const repeat = entry.barRepeats[tick.beat];
            const group = root ? `${sourceIndex}:block:${root.i}` :
              repeat && (repeat.type === "duration" || repeat.value > 1) ? `${sourceIndex}:repeat:${tick.beat}` : undefined;
            bars.push({ source: sourceIndex, startMs: tick.time, endMs: starts[index + 1]?.time ?? audio.durationMs, group });
          });
        }
      }
      const plan = buildNotebookPlan(notebookRows(snapshot), bars, settings.lineUnit === "phrase" ? 4 : 1, settings.random);
      let cursor = 0;
      const ticks = plan.chunks.flatMap((chunk) => {
        const scheduled = rendered[chunk.source].ticks
          .filter((tick) => tick.time >= chunk.startMs - 0.001 && tick.time < chunk.endMs - 0.001)
          .map((tick) => ({ ...tick, time: cursor + tick.time - chunk.startMs }));
        cursor += chunk.endMs - chunk.startMs;
        return scheduled;
      });
      // Render the final schedule, not sliced old audio: sample tails must
      // overlap their NEW neighbours in the shuffled sheet.
      const { pcm } = await renderNotebookPatternPCM(source, controller.signal, { ticks, durationMs: plan.durationMs });
      // A second start can supersede this attempt while assets are decoding.
      // Recheck ownership before installing any output or publishing paper rows.
      check();
      let getPosition: () => number;
      let ready: () => boolean;
      if (Platform.OS === "web") {
        if (!ctx || ctx.state !== "running") throw new Error("AUDIO_UNAVAILABLE");
        const player = playWebRenderedLoop(pcm, () => { if (valid() && !continuousClick) stop(); }, "both", 1, undefined, continuousClick);
        own(() => player.stop());
        const readPosition = player.getPresentedPositionSeconds ?? player.getPositionSeconds;
        if (!readPosition) throw new Error("AUDIO_POSITION_UNAVAILABLE");
        getPosition = () => readPosition() * 1000;
        ready = () => player.isRunning();
      } else {
        const uri = await saveRenderedWav(pcm, `notebook_${Date.now()}_${++fileId}.wav`);
        own(() => releaseRenderedWav(uri));
        check();
        const { createAudioPlayer } = require("expo-audio") as typeof import("expo-audio");
        const player = createAudioPlayer({ uri }, { updateInterval: 25 });
        own(() => { try { player.pause(); player.remove(); } finally { releaseRenderedWav(uri); } });
        const deadline = performance.now() + 5000;
        while (!player.isLoaded) { check(); if (performance.now() > deadline) throw new Error("AUDIO_UNAVAILABLE"); await new Promise((resolve) => setTimeout(resolve, 25)); }
        check(); player.loop = continuousClick; player.play();
        getPosition = () => player.currentTime * 1000;
        ready = () => player.playing;
      }
      const deadline = performance.now() + 5000;
      while (!ready() || getPosition() <= 0) { check(); if (performance.now() > deadline) throw new Error("AUDIO_UNAVAILABLE"); await new Promise((resolve) => setTimeout(resolve, 20)); }
      check();
      setRows(plan.rows); setPosition({ row: 0, progress: 0 }); setRunning(true); setPreparing(false);
      const release = cleanup;
      let furthestPosition = 0;
      const timer = setInterval(() => {
        if (!valid()) return;
        const at = getPosition();
        // A simple metronome has no natural end. After the last paper row,
        // keep its camera there while audio continues; native loop-position
        // resets must not make the sheet jump back to the beginning.
        furthestPosition = Math.max(furthestPosition, at);
        setPosition(notebookPosition(plan.rowEnds, continuousClick ? furthestPosition : at));
        if (!ready() || !continuousClick && at >= plan.durationMs) stop();
      }, 30);
      dispose.current = () => { clearInterval(timer); release(); };
    } catch (e) {
      cleanup();
      if (valid()) {
        setPreparing(false); setRunning(false);
        const message = e instanceof Error ? e.message : String(e);
        setError(message === "INCOMPLETE_BLOCK" ? "패턴의 반복 블록이 마지막 줄에서 잘립니다. 줄을 추가하거나 줄 단위를 변경해 주세요. / Add rows to complete the source block."
          : message === "UNSUPPORTED_PATTERN" ? "이 항목은 메트로놈 패턴이 아닙니다. 비트·바 패턴을 선택하세요. / Choose a Beat or Bar pattern."
          : message === "NOTEBOOK_TOO_LONG" ? "한 번에 최대 10분까지 재생할 수 있습니다. / Maximum playback is 10 minutes."
          : `재생하지 못했습니다 / Playback failed: ${message}`);
      }
    }
  }, [stop]);
  useEffect(() => { if (!active) stop(); }, [active, stop]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => { if (state !== "active") stop(); });
    const hidden = () => { if (typeof document !== "undefined" && document.hidden) stop(); };
    if (Platform.OS === "web") document.addEventListener("visibilitychange", hidden);
    return () => { sub.remove(); if (Platform.OS === "web") document.removeEventListener("visibilitychange", hidden); stop(); };
  }, [stop]);
  return { running, preparing, error, rows, position, start, stop };
}
