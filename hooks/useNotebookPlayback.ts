import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { DEFAULT_NOTEBOOK_SETTINGS, type StaffNotebook } from "@/lib/staff-notebook";
import { type NotebookRow } from "@/lib/staff-notebook-layout";
import { buildNotebookNotationPlan, notebookChunkEnds, notebookMeasurePosition } from "@/lib/notebook-playback-plan";
import { getNotebookPatternSchedule, renderNotebookPatternPCM } from "@/lib/audio-export";
import { getWebAudioContext, playWebRenderedLoop, releaseRenderedWav, saveRenderedWav } from "@/lib/audio-renderer";
import type { PracticeEntry } from "@/lib/storage";
import { followNotebookSigns } from "@/lib/notebook-navigation";
import { measuresInRow } from "@/lib/notebook-music-layout";

let fileId = 0;
export function useNotebookPlayback(note: StaffNotebook, active: boolean) {
  const [running, setRunning] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<NotebookRow[]>([]);
  const [position, setPosition] = useState({ row: 0, progress: 0 });
  const [measure, setMeasure] = useState(0);
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
      const continuousClick = !settings.source && !settings.followSymbols;
      const perRow = measuresInRow(settings);
      const base = buildNotebookNotationPlan({ ...snapshot, settings });
      const plan = settings.followSymbols ? followNotebookSigns(snapshot, base, perRow) : base;
      plan.chunkEnds = notebookChunkEnds(plan.chunks);
      const beats = settings.beatsPerMeasure ?? 1;
      const simple: PracticeEntry = {
        id: "notebook-click", label: `${beats}/4`, createdAt: 0, mode: "beat",
        bpm: settings.bpm, beatsPerMeasure: beats, beatTypes: Array.from({ length: beats }, (_, i) => beats > 1 && i === 0 ? "accent" : "normal"),
        beatSubdivisions: {}, barRepeats: {}, barLoopMode: "once", subdivisionPattern: [],
      };
      const source = settings.source ? settings.source.bpm === settings.bpm ? settings.source : { ...settings.source, bpm: settings.bpm } : simple;
      if (source.scoreId || source.rhythmDocument || source.mode && !["beat", "bar"].includes(source.mode))
        throw new Error("UNSUPPORTED_PATTERN");
      check();
      // The paper clock is notation time, not the imported pattern's bar clock.
      // Loop the complete original pattern independently; never slice its blocks at paper boundaries.
      const audio = getNotebookPatternSchedule(source);
      check();
      if (!(audio.durationMs > 0)) throw new Error("EMPTY_PATTERN");
      const passes = Math.ceil(plan.durationMs / audio.durationMs);
      // Play complete click measures in a continuous loop: a 7/8 paper
      // boundary must not restart the selected 4/4 click halfway through a beat.
      const durationMs = continuousClick ? passes * audio.durationMs : plan.durationMs;
      const ticks = Array.from({ length: passes }, (_, pass) =>
        audio.ticks.map((tick) => ({ ...tick, time: tick.time + pass * audio.durationMs }))
          .filter((tick) => tick.time < durationMs)).flat();
      // Render the final schedule, not sliced old audio: sample tails must
      // overlap their NEW neighbours in the shuffled sheet.
      const { pcm } = await renderNotebookPatternPCM(source, controller.signal, { ticks, durationMs });
      // Restart, stop, deactivation or unmount can cancel while assets decode.
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
      const present = (at: number) => {
        const { measure: currentMeasure, ...rowPosition } = notebookMeasurePosition(plan, at);
        setPosition(rowPosition); setMeasure(currentMeasure);
      };
      setRows(plan.rows); present(0); setRunning(true); setPreparing(false);
      const release = cleanup;
      let furthestPosition = 0;
      let previousPosition = 0;
      const timer = setInterval(() => {
        if (!valid()) return;
        const at = getPosition();
        // A simple metronome has no natural end. After the last paper row,
        // keep its camera there while audio continues; native loop-position
        // resets must not make the sheet jump back to the beginning.
        furthestPosition = Math.max(furthestPosition, continuousClick && previousPosition - at > durationMs / 2 ? durationMs : at);
        previousPosition = at;
        present(continuousClick ? furthestPosition : at);
        if (!ready() || !continuousClick && at >= plan.durationMs) stop();
      }, 30);
      dispose.current = () => { clearInterval(timer); release(); };
    } catch (e) {
      cleanup();
      // A cancelled decoder may reject late; only the current owner reports errors.
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
  return { running, preparing, error, rows, position, measure, start, stop };
}
