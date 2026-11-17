import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadSettings, saveSettings } from "@/lib/storage";
import { DEFAULT_TEMPO_TRAINER, normalizeTempoTrainer, type TempoTrainerConfig } from "@/lib/tempo-trainer";

beforeEach(async () => { await AsyncStorage.clear(); });

test("existing users receive a disabled rule and no transport state", async () => {
  await AsyncStorage.setItem("metronome_settings", JSON.stringify({ bpm: 100, beatsPerMeasure: 3, subdivisions: 1 }));
  expect((await loadSettings()).tempoTrainer).toEqual(DEFAULT_TEMPO_TRAINER);
});

test("a rule round-trips through actual settings storage", async () => {
  const tempoTrainer = { ...DEFAULT_TEMPO_TRAINER, enabled: true, intervalSeconds: 45, bpmDelta: -3, accentOnIncrease: false };
  await saveSettings({ bpm: 100, beatsPerMeasure: 5, subdivisions: 1, tempoTrainer });
  expect((await loadSettings()).tempoTrainer).toEqual(tempoTrainer);
});

test.each([null, [], "invalid", 4])("malformed persisted trainer %j receives safe defaults", async tempoTrainer => {
  await AsyncStorage.setItem("metronome_settings", JSON.stringify({ bpm: 100, beatsPerMeasure: 4, subdivisions: 1, tempoTrainer }));
  expect((await loadSettings()).tempoTrainer).toEqual(DEFAULT_TEMPO_TRAINER);
});

test("invalid fields are normalized on save and unknown runtime fields are excluded", async () => {
  const raw = {
    enabled: "true", basis: "unknown", intervalSeconds: -20, intervalMeasures: "4",
    bpmDelta: 0, accentOnIncrease: false, isPlaying: true, pending: 7,
  };
  await saveSettings({
    bpm: 100, beatsPerMeasure: 4, subdivisions: 1,
    tempoTrainer: raw as unknown as TempoTrainerConfig,
  });
  const stored = JSON.parse((await AsyncStorage.getItem("metronome_settings"))!);
  expect(stored.tempoTrainer).toEqual({
    ...DEFAULT_TEMPO_TRAINER, intervalSeconds: 1, bpmDelta: 0, accentOnIncrease: false,
  });
  expect(normalizeTempoTrainer(undefined)).toEqual(DEFAULT_TEMPO_TRAINER);
});

test("zero BPM change survives saving and loading", async () => {
  const tempoTrainer = { ...DEFAULT_TEMPO_TRAINER, enabled: true, bpmDelta: 0 };
  await saveSettings({ bpm: 100, beatsPerMeasure: 4, subdivisions: 1, tempoTrainer });
  expect((await loadSettings()).tempoTrainer).toEqual(tempoTrainer);
});
