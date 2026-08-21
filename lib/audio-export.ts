import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { MetronomeEngine, soundSets } from "./metronome-engine";
import {
  loadAssetPCM,
  decodeSampleFile,
  parseTrimInfo,
  renderMeasureAbortable,
  encodeWav,
  getRenderSampleRate,
  type ClickPCMs,
  type SamplePCMEntry,
  type TickInfo,
} from "./audio-renderer";
import { applyEntryToEngine } from "@/app/index.helpers";
import type { PracticeEntry } from "./storage";
import { logger } from "./logger";
import {
  clampRepeats as _clampRepeats,
  clampFadeOutSec as _clampFadeOutSec,
  repeatAndFadeMono as _repeatAndFadeMono,
  encodeMp3Mono as _encodeMp3Mono,
  encodeMp3MonoChunked as _encodeMp3MonoChunked,
  encodeWavMonoChunked as _encodeWavMonoChunked,
  encodeWavMonoChunkedAbortable as _encodeWavMonoChunkedAbortable,
  concatFloat32Abortable as _concatFloat32Abortable,
  EXPORT_ABORTED,
  safeFilename as _safeFilename,
} from "./audio-export-pure";

const clampRepeats = _clampRepeats;
const clampFadeOutSec = _clampFadeOutSec;
const repeatAndFadeMono = _repeatAndFadeMono;
const encodeMp3Mono = _encodeMp3Mono;
const encodeMp3MonoChunked = _encodeMp3MonoChunked;
const encodeWavMonoChunked = _encodeWavMonoChunked;
const encodeWavMonoChunkedAbortable = _encodeWavMonoChunkedAbortable;
const concatFloat32Abortable = _concatFloat32Abortable;
const safeFilename = _safeFilename;

export {
  clampRepeats,
  clampFadeOutSec,
  repeatAndFadeMono,
  repeatAndFadeStereo,
  encodeMp3Mono,
  encodeMp3Stereo,
  encodeWavStereoBytes,
  encodeWavMonoChunkedAbortable,
  EXPORT_ABORTED,
} from "./audio-export-pure";
export type { ExportFormat } from "./audio-export-pure";
import type { ExportFormat } from "./audio-export-pure";

const SR = getRenderSampleRate();

export interface ExportOptions {
  format: ExportFormat;
  repeats: number;
  fadeOutSec: number;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  uri: string;
  filename: string;
  format: ExportFormat;
}

function encodeWavMonoBytes(pcm: Float32Array, sampleRate: number = SR): Uint8Array {
  return new Uint8Array(encodeWav(pcm, sampleRate));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error(EXPORT_ABORTED);
}

async function checkpoint(signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  throwIfAborted(signal);
}

async function loadClickPCMsForSoundSet(
  setName: string,
  signal?: AbortSignal,
): Promise<ClickPCMs> {
  throwIfAborted(signal);
  const set = (soundSets as Record<string, typeof soundSets.classic>)[setName] ?? soundSets.classic;
  const [strong, high, low] = await Promise.all([
    loadAssetPCM(set.strong),
    loadAssetPCM(set.high),
    loadAssetPCM(set.low),
  ]);
  throwIfAborted(signal);
  return { strong, high, low };
}

async function loadDefaultClickPCMs(signal?: AbortSignal): Promise<ClickPCMs> {
  return loadClickPCMsForSoundSet("classic", signal);
}

/**
 * 스케줄 틱에서 layerIndex > 0인 레이어들의 사운드 셋 PCM을 로드한다.
 * layerSoundSet이 명시된 경우 해당 셋을, 없으면 classic으로 fallback.
 * 반환 Map 키: 사운드 셋 이름 ("classic" 등) 및 인덱스 키 ("#1" 등).
 */
async function loadLayerClickPCMsForSchedule(
  ticks: TickInfo[],
  signal?: AbortSignal,
): Promise<Map<string, ClickPCMs>> {
  throwIfAborted(signal);
  const soundSetByName = new Set<string>();
  const fallbackByIndex = new Map<number, string>();
  for (const tick of ticks) {
    const li = tick.layerIndex ?? 0;
    if (li > 0) {
      if (tick.layerSoundSet) {
        soundSetByName.add(tick.layerSoundSet);
      } else {
        fallbackByIndex.set(li, "classic");
        soundSetByName.add("classic");
      }
    }
  }
  if (soundSetByName.size === 0) return new Map();
  const loaded = new Map<string, ClickPCMs>();
  await Promise.all([...soundSetByName].map(async (ss) => {
    const pcms = await loadClickPCMsForSoundSet(ss, signal);
    loaded.set(ss, pcms);
  }));
  const map = new Map<string, ClickPCMs>(loaded);
  for (const [li, ss] of fallbackByIndex) {
    const pcms = loaded.get(ss);
    if (pcms) map.set(`#${li}`, pcms);
  }
  throwIfAborted(signal);
  return map;
}

async function loadEntrySamplePCMs(
  entry: PracticeEntry,
  signal?: AbortSignal,
): Promise<Map<string, SamplePCMEntry>> {
  const out = new Map<string, SamplePCMEntry>();
  const samples = entry.noteSamples || {};
  for (const [key, uri] of Object.entries(samples)) {
    throwIfAborted(signal);
    if (!uri || typeof uri !== "string") continue;
    try {
      const pcm = await decodeSampleFile(uri);
      throwIfAborted(signal);
      if (!pcm) continue;
      const { trimStartMs, trimDurationMs } = parseTrimInfo(uri);
      out.set(key, { pcm, trimStartMs, trimDurationMs });
    } catch (e) {
      logger.warn("[AudioExport] sample decode failed:", key, e);
    }
  }
  return out;
}

/**
 * 단일 PracticeEntry → 한 패스(루프 1회) 모노 PCM.
 * 한 마디(또는 블록 시퀀스 1회)를 click + 샘플 믹스로 렌더.
 */
async function renderSingleEntryLoopPCM(
  entry: PracticeEntry,
  signal?: AbortSignal,
): Promise<Float32Array> {
  throwIfAborted(signal);
  const engine = new MetronomeEngine();
  applyEntryToEngine(engine, entry);
  const info = engine.getScheduleInfo();
  if (!info.ticks.length || info.durationMs <= 0) {
    return new Float32Array(0);
  }
  const ticks = info.ticks as TickInfo[];
  const [clickPCMs, layerClickPCMs, samplePCMs] = await Promise.all([
    loadDefaultClickPCMs(signal),
    loadLayerClickPCMsForSchedule(ticks, signal),
    loadEntrySamplePCMs(entry, signal),
  ]);
  await checkpoint(signal);
  const rendered = await renderMeasureAbortable({
    schedule: ticks,
    measureDurationMs: info.durationMs,
    clickPCMs,
    samplePCMs,
    clickVolume: 1.0,
    sampleVolume: samplePCMs.size > 0 ? 1.0 : 0,
    metronomeChannel: "both",
    layerClickPCMs: layerClickPCMs.size > 0 ? layerClickPCMs : undefined,
  }, signal);
  // renderMeasure returns 2 copies; take first measure span (it includes wrapped
  // tail from the previous loop iteration, so tiling stays seamless).
  const measureSamples = Math.ceil((info.durationMs / 1000) * SR);
  const mono = rendered instanceof Float32Array ? rendered : mixStereoToMono(rendered);
  return mono.subarray(0, Math.min(measureSamples, mono.length)).slice();
}

function mixStereoToMono(s: { left: Float32Array; right: Float32Array }): Float32Array {
  const n = Math.min(s.left.length, s.right.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (s.left[i] + s.right[i]) * 0.5;
  return out;
}

/**
 * 노트 모드: noteQueueEntries 의 각 entry 를 순차 렌더 후 PCM 이어 붙이기.
 * 노트 큐가 비어있으면 entry 자체를 한 번 렌더한다.
 */
async function renderEntryAllPassesPCM(
  entry: PracticeEntry,
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<Float32Array> {
  if (entry.mode === "note" && entry.noteQueueEntries && entry.noteQueueEntries.length > 0) {
    const queue = entry.noteQueueEntries;
    const passes: Float32Array[] = [];
    for (let i = 0; i < queue.length; i++) {
      throwIfAborted(signal);
      // 큐 sub-entry 는 노트 모드 표식 제거 (단순 바 렌더로 처리)
      const sub: PracticeEntry = { ...queue[i], mode: "bar", noteQueueEntries: undefined, noteQueueEntryIds: undefined };
      const pcm = await renderSingleEntryLoopPCM(sub, signal);
      if (pcm.length > 0) passes.push(pcm);
      onProgress?.((i + 1) / queue.length * 0.5);
      await new Promise((r) => setTimeout(r, 0));
    }
    return concatFloat32Abortable(passes, signal);
  }
  throwIfAborted(signal);
  onProgress?.(0.25);
  const pcm = await renderSingleEntryLoopPCM(entry, signal);
  onProgress?.(0.5);
  return pcm;
}

async function saveBytesToCache(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<string> {
  await checkpoint(signal);
  if (Platform.OS === "web") {
    const blob = new Blob([bytes as BlobPart], { type: mimeType });
    throwIfAborted(signal);
    return URL.createObjectURL(blob);
  }
  const file = new File(Paths.cache, filename);
  try { file.delete(); } catch {}
  throwIfAborted(signal);
  file.write(bytes);
  throwIfAborted(signal);
  return file.uri;
}

function makeCacheFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const base = dot >= 0 ? filename.slice(0, dot) : filename;
  const ext = dot >= 0 ? filename.slice(dot) : "";
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${base}-${nonce}${ext}`;
}

export function discardExportedUri(uri: string): void {
  if (Platform.OS === "web") {
    revokeExportedUri(uri);
    return;
  }
  try { new File(uri).delete(); } catch {}
}

export function revokeExportedUri(uri: string): void {
  if (Platform.OS === "web" && uri.startsWith("blob:")) {
    try { URL.revokeObjectURL(uri); } catch {}
  }
}

export async function shareExportedFile(uri: string, filename: string, format: ExportFormat): Promise<void> {
  if (Platform.OS === "web") {
    // 웹은 다운로드 링크 트리거. blob URL 은 재공유를 위해 즉시 revoke 하지 않음.
    const a = document.createElement("a");
    a.href = uri;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }
  const can = await Sharing.isAvailableAsync();
  if (!can) {
    logger.warn("[AudioExport] Sharing not available on this device");
    return;
  }
  await Sharing.shareAsync(uri, {
    mimeType: format === "wav" ? "audio/wav" : "audio/mpeg",
    dialogTitle: filename,
    UTI: format === "wav" ? "com.microsoft.waveform-audio" : "public.mp3",
  });
}

/**
 * 메인 진입점.
 * 1) entry → 한 패스 PCM (note 모드면 큐 전체 이어 붙임).
 * 2) repeats 회 반복 + fadeOut 적용.
 * 3) format 에 맞춰 인코드 후 캐시에 저장. URI 반환.
 */
export async function exportPracticeEntry(
  entry: PracticeEntry,
  options: ExportOptions,
): Promise<ExportResult> {
  const { format, onProgress, signal } = options;
  throwIfAborted(signal);
  const repeats = clampRepeats(options.repeats);
  const fadeOutSec = clampFadeOutSec(options.fadeOutSec);

  onProgress?.(0.02);
  const pcm = await renderEntryAllPassesPCM(
    entry,
    (p) => onProgress?.(0.05 + p * 0.45),
    signal,
  );
  if (pcm.length === 0) {
    throw new Error("EMPTY_RENDER");
  }
  onProgress?.(0.6);
  await checkpoint(signal);

  const base = safeFilename(entry.label);
  let bytes: Uint8Array;
  let filename: string;
  let mime: string;
  if (format === "mp3") {
    bytes = await encodeMp3MonoChunked(pcm, repeats, fadeOutSec, SR, 128, signal);
    filename = `${base}_x${repeats}.mp3`;
    mime = "audio/mpeg";
  } else {
    bytes = await encodeWavMonoChunkedAbortable(pcm, repeats, fadeOutSec, SR, signal);
    filename = `${base}_x${repeats}.wav`;
    mime = "audio/wav";
  }
  onProgress?.(0.9);
  await checkpoint(signal);

  const uri = await saveBytesToCache(bytes, makeCacheFilename(filename), mime, signal);
  if (signal?.aborted) {
    discardExportedUri(uri);
    throw new Error(EXPORT_ABORTED);
  }
  onProgress?.(1);
  return { uri, filename, format };
}

