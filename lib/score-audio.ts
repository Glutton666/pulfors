// ============================================================
// 악보 재생 오디오 엔진
// 웹: Web Audio API 오실레이터 (악기별 파형)
// 네이티브: 사전 생성 WAV 파일 + expo-audio createAudioPlayer
// ============================================================

import { Platform } from "react-native";
import { getWebAudioContext } from "./audio-renderer";
import type { PlayNoteEvent } from "./score-playback";
import { INSTRUMENTS, type DrumType } from "./score-types";
import { safePlay } from "./audio-utils";

// ── MIDI → 주파수 ─────────────────────────────────────────────

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── 악기 → 오실레이터 파형 매핑 ─────────────────────────────

type WaveformType = "sine" | "triangle" | "sawtooth" | "square";

/**
 * 악기 ID를 오실레이터 파형으로 변환합니다.
 * - woodwind (플루트, 오보에, ...)  → sine   (맑고 순수한 음색)
 * - keyboard (피아노, 오르간, ...) → triangle (배음이 있는 피아노 음색)
 * - percussion (마림바, 팀파니)     → triangle
 * - strings (바이올린, 첼로, ...)   → sawtooth (현악기 풍성한 배음)
 * - brass (트럼펫, 호른, ...)       → sawtooth
 * - guitar                         → sawtooth
 * - vocal, other                   → sine
 */
export function instrumentToWaveform(instrumentId: string): WaveformType {
  const def = INSTRUMENTS[instrumentId];
  if (!def) return "sine";
  switch (def.category) {
    case "keyboard":
    case "percussion":
      return "triangle";
    case "strings":
    case "brass":
    case "guitar":
      return "sawtooth";
    case "woodwind":
    case "vocal":
    case "other":
    default:
      return "sine";
  }
}

// ── 드럼 사운드 파라미터 (노이즈 기반 합성) ──────────────────

interface DrumSoundParams {
  /** 노이즈(0~1) 대 톤(0~1) 혼합 비율. 1이면 순수 노이즈, 0이면 순수 톤 */
  noiseMix: number;
  /** 톤 성분 기본 주파수(Hz) — 킥/탐탐류의 몸통음 */
  toneFreq: number;
  /** 발음 지속 시간(초) */
  decayS: number;
  /** 밴드패스/로우패스 필터 컷오프(Hz, 웹 전용 근사) */
  filterHz: number;
}

const DRUM_SOUND_PARAMS: Record<DrumType, DrumSoundParams> = {
  kick:         { noiseMix: 0.15, toneFreq: 60,  decayS: 0.35, filterHz: 200 },
  snare:        { noiseMix: 0.75, toneFreq: 180, decayS: 0.18, filterHz: 2500 },
  hihat_closed: { noiseMix: 0.95, toneFreq: 800, decayS: 0.06, filterHz: 9000 },
  hihat_open:   { noiseMix: 0.95, toneFreq: 800, decayS: 0.35, filterHz: 9000 },
  crash:        { noiseMix: 0.9,  toneFreq: 500, decayS: 1.2,  filterHz: 7000 },
  ride:         { noiseMix: 0.7,  toneFreq: 600, decayS: 0.8,  filterHz: 6000 },
  tom_high:     { noiseMix: 0.2,  toneFreq: 260, decayS: 0.28, filterHz: 500 },
  tom_mid:      { noiseMix: 0.2,  toneFreq: 180, decayS: 0.3,  filterHz: 400 },
  tom_low:      { noiseMix: 0.2,  toneFreq: 110, decayS: 0.32, filterHz: 300 },
};

// ── 네이티브: WAV 파일 캐시 ──────────────────────────────────

// 캐시 키: `${midiNote}_${waveform}` (악기별로 별도 파일), 드럼은 `drum_${drumType}`
const _fileCache = new Map<string, string>();

const NOTE_SR = 22050;          // 샘플링 레이트
const NOTE_FILE_DUR_S = 2.0;   // 파일에 저장할 음표 최대 길이 (2초)

/** 파형별 PCM 생성 (attack/release envelope 포함) */
function _generatePCM(midi: number, durationS: number, sr: number, waveform: WaveformType): Float32Array {
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
    const phase = (freq * i / sr) % 1;
    let sample: number;
    switch (waveform) {
      case "triangle":
        sample = 2 * Math.abs(2 * phase - 1) - 1;
        break;
      case "sawtooth":
        sample = 2 * phase - 1;
        break;
      case "square":
        sample = phase < 0.5 ? 1 : -1;
        break;
      case "sine":
      default:
        sample = Math.sin(2 * Math.PI * freq * i / sr);
        break;
    }
    pcm[i] = sample * env;
  }
  return pcm;
}

/** 드럼 노이즈+톤 혼합 PCM 생성 (attack/decay envelope 포함) */
function _generateDrumPCM(drumType: DrumType, sr: number): Float32Array {
  const params = DRUM_SOUND_PARAMS[drumType];
  const durationS = Math.min(NOTE_FILE_DUR_S, params.decayS + 0.05);
  const n = Math.floor(sr * durationS);
  const pcm = new Float32Array(n);
  const attackSamples = Math.max(1, Math.floor(sr * 0.002)); // 2ms attack (타격감)
  // 단순 1차 저역통과 필터 상태 (노이즈를 filterHz 근처로 성형)
  let filtered = 0;
  const rc = 1 / (2 * Math.PI * params.filterHz);
  const dt = 1 / sr;
  const alpha = dt / (rc + dt);
  for (let i = 0; i < n; i++) {
    const tSec = i / sr;
    let env: number;
    if (i < attackSamples) {
      env = i / attackSamples;
    } else {
      env = Math.exp(-tSec / (params.decayS / 4));
    }
    const noise = Math.random() * 2 - 1;
    filtered += alpha * (noise - filtered);
    const tone = Math.sin(2 * Math.PI * params.toneFreq * tSec) * Math.exp(-tSec / (params.decayS / 3));
    const sample = params.noiseMix * filtered + (1 - params.noiseMix) * tone;
    pcm[i] = sample * env * 0.9;
  }
  return pcm;
}

/** 네이티브: 특정 드럼 종류의 WAV 파일 생성 및 캐시 */
async function _ensureDrumFile(drumType: DrumType): Promise<void> {
  const cacheKey = `drum_${drumType}`;
  if (_fileCache.has(cacheKey)) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { encodeWav } = require("./audio-renderer") as typeof import("./audio-renderer");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { File, Paths } = require("expo-file-system") as typeof import("expo-file-system");
  const pcm = _generateDrumPCM(drumType, NOTE_SR);
  const wav = encodeWav(pcm, NOTE_SR);
  const file = new File(Paths.cache, `score_drum_${drumType}.wav`);
  file.write(new Uint8Array(wav));
  _fileCache.set(cacheKey, file.uri);
}

/** 네이티브: 특정 MIDI 음표 + 파형용 WAV 파일 생성 및 캐시 */
async function _ensureNoteFile(midi: number, waveform: WaveformType): Promise<void> {
  const cacheKey = `${midi}_${waveform}`;
  if (_fileCache.has(cacheKey)) return;
  // Use require() for lazy loading — works identically on Hermes/native and in
  // Jest's CJS environment (dynamic import() is not transformed by babel-jest).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { encodeWav } = require("./audio-renderer") as typeof import("./audio-renderer");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { File, Paths } = require("expo-file-system") as typeof import("expo-file-system");
  const pcm = _generatePCM(midi, NOTE_FILE_DUR_S, NOTE_SR, waveform);
  const wav = encodeWav(pcm, NOTE_SR);
  const file = new File(Paths.cache, `score_note_${midi}_${waveform}.wav`);
  file.write(new Uint8Array(wav));
  _fileCache.set(cacheKey, file.uri);
}

// ── 진행 중인 오디오 추적 ────────────────────────────────────

// 현재 스케줄된 마디의 취소 함수 (단일)
let _currentMeasureStop: (() => void) | null = null;

// 현재 재생 중인 미리 듣기의 취소 함수 (단일)
let _currentPreviewStop: (() => void) | null = null;

// ── 웹: AudioContext 오실레이터 발음 ─────────────────────────

function _playWebNote(midi: number, durationMs: number, volume: number, oscType: WaveformType = "sine"): () => void {
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
  osc.type = oscType;
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

// ── 웹: AudioContext 노이즈 버퍼 기반 드럼 발음 ──────────────

function _playWebDrum(drumType: DrumType, volume: number): () => void {
  const ctx = getWebAudioContext();
  if (!ctx) return () => {};
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const params = DRUM_SOUND_PARAMS[drumType];
  const t = ctx.currentTime;
  const dur = params.decayS;

  const bufferSize = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, Math.max(1, bufferSize), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = buffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = params.toneFreq < 300 ? "lowpass" : "bandpass";
  noiseFilter.frequency.value = params.filterHz;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(volume * params.noiseMix, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  noiseSrc.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseSrc.start(t);
  noiseSrc.stop(t + dur + 0.02);

  let osc: OscillatorNode | null = null;
  let oscGain: GainNode | null = null;
  if (params.noiseMix < 1) {
    osc = ctx.createOscillator();
    oscGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(params.toneFreq, t);
    oscGain.gain.setValueAtTime(volume * (1 - params.noiseMix), t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    try {
      const now = ctx.currentTime;
      noiseGain.gain.cancelScheduledValues(now);
      noiseGain.gain.setValueAtTime(noiseGain.gain.value, now);
      noiseGain.gain.linearRampToValueAtTime(0, now + 0.02);
      noiseSrc.stop(now + 0.02);
      if (osc && oscGain) {
        oscGain.gain.cancelScheduledValues(now);
        oscGain.gain.setValueAtTime(oscGain.gain.value, now);
        oscGain.gain.linearRampToValueAtTime(0, now + 0.02);
        osc.stop(now + 0.02);
      }
    } catch {}
    setTimeout(() => {
      try {
        noiseSrc.disconnect(); noiseFilter.disconnect(); noiseGain.disconnect();
        osc?.disconnect(); oscGain?.disconnect();
      } catch {}
    }, 50);
  };
}

// ── 네이티브: 드럼 WAV 파일 기반 발음 ────────────────────────

async function _playNativeDrum(drumType: DrumType, volume: number): Promise<() => void> {
  const cacheKey = `drum_${drumType}`;
  const uri = _fileCache.get(cacheKey);
  if (!uri) return () => {};

  let player: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createAudioPlayer } = require("expo-audio") as typeof import("expo-audio");
    player = createAudioPlayer({ uri });
    player.volume = Math.max(0, Math.min(1, volume));
    safePlay(player, "score-audio.play-drum");
  } catch {
    return () => {};
  }

  const durationMs = DRUM_SOUND_PARAMS[drumType].decayS * 1000;
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

// ── 네이티브: WAV 파일 기반 발음 ─────────────────────────────

async function _playNativeNote(
  midi: number,
  durationMs: number,
  volume: number,
  waveform: WaveformType = "sine",
): Promise<() => void> {
  const cacheKey = `${midi}_${waveform}`;
  const uri = _fileCache.get(cacheKey);
  if (!uri) return () => {};

  let player: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createAudioPlayer } = require("expo-audio") as typeof import("expo-audio");
    player = createAudioPlayer({ uri });
    player.volume = Math.max(0, Math.min(1, volume));
    safePlay(player, "score-audio.play");
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
 * 디바이스 성능에 맞는 오디오 파일 배치 크기를 반환합니다.
 *
 * - 웹/공통: navigator.hardwareConcurrency (CPU 코어 수) 기반 (우선 시도)
 *   - 8코어 이상 → 8 (고성능 데스크탑/노트북)
 *   - 4코어 이상 → 6
 *   - 그 미만    → 4 (기본)
 * - 네이티브 폴백 (Hermes는 hardwareConcurrency 미노출):
 *   - iOS 16+   → 6 (A15 Bionic 이상, 퍼포먼스 코어 2개 이상)
 *   - Android 12+ (API 31+) → 6 (최신 플래그십 기기)
 *   - 그 외     → 4 (안전 기본값)
 */
export function getPrepareBatchSize(): number {
  // hardwareConcurrency가 노출된 환경(웹, 일부 RN 빌드)은 코어 수 기반
  if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) {
    const cores = navigator.hardwareConcurrency;
    if (cores >= 8) return 8;
    if (cores >= 4) return 6;
    return 4;
  }

  // 네이티브 폴백: 플랫폼 버전을 기기 세대 프록시로 사용
  if (Platform.OS === "ios") {
    // Platform.Version은 iOS에서 "17.4" 같은 문자열
    const ver =
      typeof Platform.Version === "string"
        ? parseFloat(Platform.Version)
        : (Platform.Version as number);
    return ver >= 16 ? 6 : 4;
  }
  if (Platform.OS === "android") {
    // Platform.Version은 Android에서 API 레벨 숫자
    const api =
      typeof Platform.Version === "number"
        ? Platform.Version
        : parseInt(Platform.Version as string, 10);
    return api >= 31 ? 6 : 4;
  }

  return 4; // 알 수 없는 플랫폼 안전 기본값
}

/**
 * 악보 재생 전 필요한 MIDI 음표 파일을 미리 준비합니다.
 * 네이티브: 악기에 맞는 파형 WAV 파일 생성 + 캐시 (없는 음표만)
 * 웹: no-op (AudioContext는 지연 초기화)
 *
 * @param onProgress - 진행 상황 콜백 (done: 완료된 음표 수, total: 전체 음표 수)
 * @param instrumentId - 악기 ID (없으면 sine 파형; noteInstrumentPairs 미제공 시 전체 음표에 적용)
 * @param noteInstrumentPairs - 음표별 악기 지정 목록. 제공 시 각 쌍의 instrumentId로
 *   파형을 결정하며, (MIDI, 파형) 조합별로 별도 WAV 파일을 생성합니다.
 *   하나의 MIDI 음이 여러 악기에 걸쳐 사용될 경우 각 악기마다 별도 파일이 준비됩니다.
 *   이 파라미터를 사용하면 midiNotes와 instrumentId는 무시됩니다.
 */
export async function prepareScoreAudio(
  midiNotes: number[],
  onProgress?: (done: number, total: number) => void,
  batchSize = 4,
  instrumentId?: string,
  noteInstrumentPairs?: Array<{ midi: number; instrumentId: string }>,
): Promise<void> {
  if (Platform.OS === "web") return;

  // Build the unique set of (midi, waveform) pairs to prepare.
  // When noteInstrumentPairs is supplied we use per-note instrument data so that
  // a score switching instruments mid-stream generates the correct WAV for each
  // instrument (e.g. violin → sawtooth AND piano → triangle for the same pitch).
  let pairs: Array<{ midi: number; waveform: WaveformType }>;

  if (noteInstrumentPairs && noteInstrumentPairs.length > 0) {
    const seen = new Set<string>();
    pairs = [];
    for (const { midi, instrumentId: instId } of noteInstrumentPairs) {
      if (midi < 21 || midi > 108) continue;
      const waveform = instrumentToWaveform(instId);
      const key = `${midi}_${waveform}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({ midi, waveform });
      }
    }
  } else {
    const waveform = instrumentToWaveform(instrumentId ?? "");
    const seen = new Set<number>();
    pairs = [];
    for (const midi of midiNotes) {
      if (midi < 21 || midi > 108) continue;
      if (!seen.has(midi)) {
        seen.add(midi);
        pairs.push({ midi, waveform });
      }
    }
  }

  const total = pairs.length;
  let done = 0;
  for (let i = 0; i < pairs.length; i += batchSize) {
    const batch = pairs.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async ({ midi, waveform }) => {
        await _ensureNoteFile(midi, waveform);
        done += 1;
        onProgress?.(done, total);
      }),
    );
  }
}

/**
 * 악보 재생 전 필요한 드럼 WAV 파일을 미리 준비합니다 (네이티브 전용).
 * 웹: no-op (AudioContext 노이즈 버퍼는 지연 생성)
 */
export async function prepareDrumAudio(drumTypes: DrumType[]): Promise<void> {
  if (Platform.OS === "web") return;
  const unique = [...new Set(drumTypes)];
  await Promise.all(unique.map((dt) => _ensureDrumFile(dt)));
}

/**
 * 마디 내 음표들을 setTimeout으로 스케줄링합니다.
 * 이전 마디의 예약이 남아 있으면 먼저 취소합니다.
 * 반환된 함수를 호출하면 예약 취소 + 발음 중인 음표 즉시 정지.
 *
 * @param instrumentId - 악기 ID (없으면 sine 파형)
 */
export function scheduleMeasureNotes(
  notes: PlayNoteEvent[],
  volume = 0.7,
  instrumentId?: string,
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
    if (!note.drumType && (note.midiNote < 21 || note.midiNote > 108)) continue;
    if (note.durationMs <= 0) continue;

    const drumType = note.drumType;

    // 다악기 악보: 음표별 instrumentId → waveform 결정
    // 단일 파트 악보(note.instrumentId 없음): top-level instrumentId 폴백
    const noteWaveform = instrumentToWaveform(note.instrumentId ?? instrumentId ?? "");

    const tid = setTimeout(() => {
      if (cancelled) return;
      const idx = myTids.indexOf(tid);
      if (idx >= 0) myTids.splice(idx, 1);

      if (Platform.OS === "web") {
        const stop = drumType
          ? _playWebDrum(drumType, volume)
          : _playWebNote(note.midiNote, note.durationMs, volume, noteWaveform);
        myStopFns.push(stop);
      } else {
        const playPromise = drumType
          ? _playNativeDrum(drumType, volume)
          : _playNativeNote(note.midiNote, note.durationMs, volume, noteWaveform);
        playPromise.then((stop) => {
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
 * instrumentId가 주어지면 해당 악기의 음색(파형)으로 재생합니다.
 * 이전 미리 듣기가 아직 재생 중이면 먼저 취소합니다 (빠른 연속 탭 시 겹침 방지).
 * 네이티브: WAV 파일이 캐시에 없으면 먼저 생성 후 발음
 * 웹: AudioContext 오실레이터로 즉시 발음
 */
export function previewScoreNote(midi: number, instrumentId?: string): void {
  if (midi < 21 || midi > 108) return;

  // 이전 미리 듣기를 즉시 취소
  if (_currentPreviewStop) {
    _currentPreviewStop();
    _currentPreviewStop = null;
  }

  const PREVIEW_MS = 300;
  const PREVIEW_VOL = 0.6;
  const waveform = instrumentToWaveform(instrumentId ?? "");

  if (Platform.OS === "web") {
    const stop = _playWebNote(midi, PREVIEW_MS, PREVIEW_VOL, waveform);
    _currentPreviewStop = stop;
  } else {
    // 비동기 경로: 파일 준비가 완료된 시점에도 더 새로운 미리 듣기가
    // 시작됐을 수 있으므로, 토큰 비교로 최신 호출인지 확인합니다.
    const token = {};
    _currentPreviewStop = () => { (token as any).__cancelled = true; };

    _ensureNoteFile(midi, waveform).then(async () => {
      if ((token as any).__cancelled) return;
      const stop = await _playNativeNote(midi, PREVIEW_MS, PREVIEW_VOL, waveform);
      if ((token as any).__cancelled) {
        stop();
      } else {
        _currentPreviewStop = stop;
      }
    }).catch(() => {});
  }
}

/**
 * 드럼 노트 입력 즉시 미리 듣기 (드럼 종류별 decayS 길이, 볼륨 0.6)
 * 이전 미리 듣기가 아직 재생 중이면 먼저 취소합니다.
 */
export function previewScoreDrum(drumType: DrumType): void {
  if (_currentPreviewStop) {
    _currentPreviewStop();
    _currentPreviewStop = null;
  }

  const PREVIEW_VOL = 0.6;

  if (Platform.OS === "web") {
    const stop = _playWebDrum(drumType, PREVIEW_VOL);
    _currentPreviewStop = stop;
  } else {
    const token = {};
    _currentPreviewStop = () => { (token as any).__cancelled = true; };

    _ensureDrumFile(drumType).then(async () => {
      if ((token as any).__cancelled) return;
      const stop = await _playNativeDrum(drumType, PREVIEW_VOL);
      if ((token as any).__cancelled) {
        stop();
      } else {
        _currentPreviewStop = stop;
      }
    }).catch(() => {});
  }
}

/**
 * 진행 중인 미리 듣기(previewScoreNote) 오디오를 즉시 중지합니다.
 * 에디터 닫힘(언마운트) 시 호출합니다.
 */
export function stopPreviewNote(): void {
  if (_currentPreviewStop) {
    _currentPreviewStop();
    _currentPreviewStop = null;
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
