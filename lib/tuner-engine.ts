export interface TuningNote {
  name: string;
  frequency: number;
  octave: number;
  string: number;
}

export interface InstrumentTuning {
  name: string;
  label: string;
  notes: TuningNote[];
}

export const TUNINGS: InstrumentTuning[] = [
  {
    name: "electric",
    label: "Electric Guitar",
    notes: [
      { name: "E", frequency: 329.63, octave: 4, string: 1 },
      { name: "B", frequency: 246.94, octave: 3, string: 2 },
      { name: "G", frequency: 196.0, octave: 3, string: 3 },
      { name: "D", frequency: 146.83, octave: 3, string: 4 },
      { name: "A", frequency: 110.0, octave: 2, string: 5 },
      { name: "E", frequency: 82.41, octave: 2, string: 6 },
    ],
  },
  {
    name: "acoustic",
    label: "Acoustic Guitar",
    notes: [
      { name: "E", frequency: 329.63, octave: 4, string: 1 },
      { name: "B", frequency: 246.94, octave: 3, string: 2 },
      { name: "G", frequency: 196.0, octave: 3, string: 3 },
      { name: "D", frequency: 146.83, octave: 3, string: 4 },
      { name: "A", frequency: 110.0, octave: 2, string: 5 },
      { name: "E", frequency: 82.41, octave: 2, string: 6 },
    ],
  },
  {
    name: "bass",
    label: "Bass Guitar",
    notes: [
      { name: "G", frequency: 98.0, octave: 2, string: 1 },
      { name: "D", frequency: 73.42, octave: 2, string: 2 },
      { name: "A", frequency: 55.0, octave: 1, string: 3 },
      { name: "E", frequency: 41.2, octave: 1, string: 4 },
    ],
  },
  {
    name: "bass5",
    label: "5-String Bass",
    notes: [
      { name: "G", frequency: 98.0, octave: 2, string: 1 },
      { name: "D", frequency: 73.42, octave: 2, string: 2 },
      { name: "A", frequency: 55.0, octave: 1, string: 3 },
      { name: "E", frequency: 41.2, octave: 1, string: 4 },
      { name: "B", frequency: 30.87, octave: 0, string: 5 },
    ],
  },
  {
    name: "dropD",
    label: "Drop D",
    notes: [
      { name: "E", frequency: 329.63, octave: 4, string: 1 },
      { name: "B", frequency: 246.94, octave: 3, string: 2 },
      { name: "G", frequency: 196.0, octave: 3, string: 3 },
      { name: "D", frequency: 146.83, octave: 3, string: 4 },
      { name: "A", frequency: 110.0, octave: 2, string: 5 },
      { name: "D", frequency: 73.42, octave: 2, string: 6 },
    ],
  },
  {
    name: "ukulele",
    label: "Ukulele",
    notes: [
      { name: "A", frequency: 440.0, octave: 4, string: 1 },
      { name: "E", frequency: 329.63, octave: 4, string: 2 },
      { name: "C", frequency: 261.63, octave: 4, string: 3 },
      { name: "G", frequency: 392.0, octave: 4, string: 4 },
    ],
  },
];

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function frequencyToNote(freq: number): { name: string; octave: number; cents: number } {
  const semitones = 12 * Math.log2(freq / 440);
  const rounded = Math.round(semitones);
  const cents = Math.round((semitones - rounded) * 100);
  const noteIndex = ((rounded % 12) + 12 + 9) % 12;
  const octave = Math.floor((rounded + 9) / 12) + 4;
  return { name: NOTE_NAMES[noteIndex], octave, cents };
}

export function findClosestTuningNote(
  freq: number,
  tuning: InstrumentTuning
): { note: TuningNote; cents: number } | null {
  if (freq < 20 || freq > 2000) return null;

  let closest: TuningNote | null = null;
  let minCents = Infinity;

  for (const note of tuning.notes) {
    const cents = 1200 * Math.log2(freq / note.frequency);
    if (Math.abs(cents) < Math.abs(minCents)) {
      minCents = cents;
      closest = note;
    }
  }

  if (!closest || Math.abs(minCents) > 100) return null;
  return { note: closest, cents: Math.round(minCents) };
}

export function autoCorrelate(buffer: Float32Array, sampleRate: number, rmsThreshold: number = 0.01): number {
  const SIZE = buffer.length;

  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / SIZE);

  if (rms < rmsThreshold) return -1;

  let r1 = 0;
  let r2 = SIZE - 1;
  const thresh = 0.2;

  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buffer[i]) < thresh) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buffer[SIZE - i]) < thresh) {
      r2 = SIZE - i;
      break;
    }
  }

  const buf = buffer.slice(r1, r2);
  const c = new Float32Array(buf.length);

  for (let i = 0; i < buf.length; i++) {
    for (let j = 0; j < buf.length - i; j++) {
      c[i] += buf[j] * buf[j + i];
    }
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;

  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < buf.length; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }

  let T0 = maxpos;

  const x1 = c[T0 - 1] ?? 0;
  const x2 = c[T0];
  const x3 = c[T0 + 1] ?? 0;

  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;

  if (a) T0 = T0 - b / (2 * a);

  return sampleRate / T0;
}
