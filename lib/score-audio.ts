// ============================================================
// 악보 재생 오디오 엔진
// 웹: Web Audio API 오실레이터 (사인파)
// 네이티브: 사전 생성 WAV 파일 + expo-audio createAudioPlayer
// ============================================================

import { Platform } from "react-native";
import { getWebAudioContext } from "./audio-renderer";
import type { PlayNoteEvent } from "./score-playback";

// ── MIDI → 주파수 ─────────────────────────────────────────────

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── 네이티브: WAV 파일 캐시 ──────────────────────────────────

const _fileCache = new Map<number, string>(); // midiNote → file URI

const NOTE_SR = 22050;          // 샘플링 레이트
const NOTE_FILE_DUR_S = 2.0;   // 파일에 저장할 음표 최대 길이 (2초)

/** 사인파 PCM 생성 (attack/release envelope 포함) */
function _generateSinePCM(midi: number, durationS: number, sr: number): Float32Array {
  const freq = midiToFreq(midi);
  const n = Math.floor(sr * durationS);
  const pcm = new Float32Array(n);
  const attackSamples = Math.floor(sr * 0.008);   // 8ms attack
  const releaseSamples = Math.floor(sr * 0.12);   // 120ms release
  for (let i = 0; i < n; i++) {
    let env = 0.6;
    if (i < attackSamples) {
      env = (i / attackSamples) * 0.6;
    } else if (i > n - releaseSamples) {
      env = Math.max(0, (n - i) / releaseSamples) * 0.6;
    }
    pcm[i] = Math.sin(2 * Math.PI * freq * i / sr) * env;
  }
  return pcm;
}

/** 네이티브: 특정 MIDI 음표용 WAV 파일 생성 및 캐시 */
async function _ensureNoteFile(midi: number): Promise<void> {
  if (_fileCache.has(midi)) return;
  const [{ encodeWav }, { File, Paths }] = await Promise.all([
    import("./audio-renderer"),
    import("expo-file-system"),
  ]);
  const pcm = _generateSinePCM(midi, NOTE_FILE_DUR_S, NOTE_SR);
  const wav = encodeWav(pcm, NOTE_SR);
  const file = new File(Paths.cache, `score_note_${midi}.wav`);
  file.write(new Uint8Array(wav));
  _fileCache.set(midi, file.uri);
}

// ── 진행 중인 오디오 추적 ────────────────────────────────────

// 현재 스케줄된 마디의 취소 함수 (단일)
let _currentMeasureStop: (() => void) | null = null;

// ── 웹: AudioContext 오실레이터 발음 ─────────────────────────

function _playWebNote(midi: number, durationMs: number, volume: number): () => void {
  const ctx = getWebAudioContext();
  if (!ctx) return () => {};
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const freq = midiToFreq(midi);
  const t = ctx.currentTime;
  const dur = Math.max(0.02, durationMs / 1000);
  const attack = 0.008;
  const release = Math.min(0.08, dur * 0.25);
  const sustain = Math.max(attack + 0.001, dur - release);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + attack);
  gain.gain.setValueAtTime(volume, t + sustain);
  gain.gain.linearRampToValueAtTime(0, t + dur);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.015);

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    try {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.02);
      osc.stop(now + 0.02);
    } catch {}
    setTimeout(() => {
      try { osc.disconnect(); gain.disconnect(); } catch {}
    }, 50);
  };
}

// ── 네이티브: WAV 파일 기반 발음 ─────────────────────────────

async function _playNativeNote(
  midi: number,
  durationMs: number,
  volume: number,
): Promise<() => void> {
  const uri = _fileCache.get(midi);
  if (!uri) return () => {};

  let player: any;
  try {
    const { createAudioPlayer } = await import("expo-audio");
    player = createAudioPlayer({ uri });
    player.volume = Math.max(0, Math.min(1, volume));
    player.play();
  } catch {
    return () => {};
  }

  const stopTid = setTimeout(() => {
    try { player.pause(); } catch {}
  }, durationMs + 50);

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(stopTid);
    try { player.pause(); } catch {}
  };
}

// ── 공개 API ─────────────────────────────────────────────────

/**
 * 악보 재생 전 필요한 MIDI 음표 파일을 미리 준비합니다.
 * 네이티브: 사인파 WAV 파일 생성 + 캐시 (없는 음표만)
 * 웹: no-op (AudioContext는 지연 초기화)
 */
export async function prepareScoreAudio(midiNotes: number[]): Promise<void> {
  if (Platform.OS === "web") return;
  const unique = [...new Set(midiNotes)].filter((m) => m >= 21 && m <= 108);
  await Promise.all(unique.map((m) => _ensureNoteFile(m)));
}

/**
 * 마디 내 음표들을 setTimeout으로 스케줄링합니다.
 * 이전 마디의 예약이 남아 있으면 먼저 취소합니다.
 * 반환된 함수를 호출하면 예약 취소 + 발음 중인 음표 즉시 정지.
 */
export function scheduleMeasureNotes(
  notes: PlayNoteEvent[],
  volume = 0.7,
): () => void {
  // 이전 마디 취소
  if (_currentMeasureStop) {
    _currentMeasureStop();
    _currentMeasureStop = null;
  }

  const myTids: ReturnType<typeof setTimeout>[] = [];
  const myStopFns: Array<() => void> = [];
  let cancelled = false;

  for (const note of notes) {
    if (note.midiNote < 21 || note.midiNote > 108) continue;
    if (note.durationMs <= 0) continue;

    const tid = setTimeout(() => {
      if (cancelled) return;
      const idx = myTids.indexOf(tid);
      if (idx >= 0) myTids.splice(idx, 1);

      if (Platform.OS === "web") {
        const stop = _playWebNote(note.midiNote, note.durationMs, volume);
        myStopFns.push(stop);
      } else {
        _playNativeNote(note.midiNote, note.durationMs, volume).then((stop) => {
          if (cancelled) {
            stop();
          } else {
            myStopFns.push(stop);
          }
        });
      }
    }, note.startOffsetMs);

    myTids.push(tid);
  }

  const cancel = () => {
    cancelled = true;
    for (const tid of myTids) clearTimeout(tid);
    myTids.length = 0;
    for (const fn of myStopFns) {
      try { fn(); } catch {}
    }
    myStopFns.length = 0;
    if (_currentMeasureStop === cancel) _currentMeasureStop = null;
  };

  _currentMeasureStop = cancel;
  return cancel;
}

/**
 * 음표 입력 즉시 미리 듣기 (0.3초 고정, 볼륨 0.6)
 * 네이티브: WAV 파일이 캐시에 없으면 먼저 생성 후 발음
 * 웹: AudioContext 오실레이터로 즉시 발음
 */
export function previewScoreNote(midi: number): void {
  if (midi < 21 || midi > 108) return;
  const PREVIEW_MS = 300;
  const PREVIEW_VOL = 0.6;
  if (Platform.OS === "web") {
    _playWebNote(midi, PREVIEW_MS, PREVIEW_VOL);
  } else {
    _ensureNoteFile(midi).then(() =>
      _playNativeNote(midi, PREVIEW_MS, PREVIEW_VOL),
    ).catch(() => {});
  }
}

/**
 * 진행 중인 모든 악보 오디오를 즉시 중지합니다.
 * stop/pause 시 호출합니다.
 */
export function stopAllScoreNotes(): void {
  if (_currentMeasureStop) {
    _currentMeasureStop();
    _currentMeasureStop = null;
  }
}
