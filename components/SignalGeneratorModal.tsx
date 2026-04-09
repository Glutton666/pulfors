import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Modal,
  TextInput,
  PanResponder,
  ScrollView,
  FlatList,
  useWindowDimensions,
  Alert,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Audio, InterruptionModeIOS } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import { useScale } from "@/lib/scale";
import type { ScaleValues } from "@/lib/scale";
import {
  WaveType,
  SignalGeneratorEngine,
  generateToneDataUri,
  generateToneBase64,
} from "@/lib/signal-generator-engine";
import { TUNING_DATA } from "@/lib/tuning-data";
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];


function decodeWavBase64(base64: string, sampleRate: number): { samples: Float32Array; rate: number } | null {
  try {
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const view = new DataView(bytes.buffer);
    const riffTag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    if (riffTag !== "RIFF") {
      console.warn("[MicTuner] decodeWav: not a WAV file, header:", riffTag, "size:", bytes.length);
      return null;
    }
    const numChannels = view.getUint16(22, true);
    const wavSampleRate = view.getUint32(24, true);
    const bitsPerSample = view.getUint16(34, true);
    let dataOffset = 36;
    while (dataOffset < bytes.length - 8) {
      const tag = String.fromCharCode(bytes[dataOffset], bytes[dataOffset + 1], bytes[dataOffset + 2], bytes[dataOffset + 3]);
      const chunkSize = view.getUint32(dataOffset + 4, true);
      if (tag === "data") {
        dataOffset += 8;
        const bytesPerSample = bitsPerSample / 8;
        const numSamples = Math.floor(chunkSize / (bytesPerSample * numChannels));
        const samples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
          const offset = dataOffset + i * bytesPerSample * numChannels;
          if (offset + bytesPerSample > bytes.length) break;
          if (bitsPerSample === 16) {
            samples[i] = view.getInt16(offset, true) / 32768;
          } else if (bitsPerSample === 8) {
            samples[i] = (bytes[offset] - 128) / 128;
          }
        }
        return { samples, rate: wavSampleRate || sampleRate };
      }
      dataOffset += 8 + chunkSize;
    }
    return null;
  } catch {
    return null;
  }
}

function realFFT(samples: Float32Array): Float32Array {
  const N = samples.length;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let i = 0; i < N; i++) re[i] = samples[i];

  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
    let k = N >> 1;
    while (k <= j) { j -= k; k >>= 1; }
    j += k;
  }

  for (let len = 2; len <= N; len <<= 1) {
    const halfLen = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < N; i += len) {
      let curRe = 1, curIm = 0;
      for (let jj = 0; jj < halfLen; jj++) {
        const tRe = curRe * re[i + jj + halfLen] - curIm * im[i + jj + halfLen];
        const tIm = curRe * im[i + jj + halfLen] + curIm * re[i + jj + halfLen];
        re[i + jj + halfLen] = re[i + jj] - tRe;
        im[i + jj + halfLen] = im[i + jj] - tIm;
        re[i + jj] += tRe;
        im[i + jj] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }

  const mag = new Float32Array(N >> 1);
  for (let i = 0; i < mag.length; i++) {
    const power = re[i] * re[i] + im[i] * im[i];
    mag[i] = power > 0 ? 10 * Math.log10(power / N) : -100;
  }
  return mag;
}

function analyzeWavLocally(base64: string, sampleRate: number): { frequency: number | null; note: string | null } {
  const decoded = decodeWavBase64(base64, sampleRate);
  const WINDOW_SIZE = 8192;
  if (!decoded || decoded.samples.length <= WINDOW_SIZE) return { frequency: null, note: null };
  const readings: number[] = [];
  const step = Math.floor(WINDOW_SIZE / 2);
  for (let offset = 0; offset + WINDOW_SIZE <= decoded.samples.length; offset += step) {
    const win = decoded.samples.slice(offset, offset + WINDOW_SIZE);
    let rms = 0;
    for (let i = 0; i < win.length; i++) rms += win[i] * win[i];
    rms = Math.sqrt(rms / win.length);
    if (rms < 0.03) continue;

    for (let i = 0; i < WINDOW_SIZE; i++) {
      win[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / (WINDOW_SIZE - 1)));
    }
    const mag = realFFT(win);
    const result = fftPeakDetect(mag, decoded.rate, WINDOW_SIZE);
    if (result && result.freq > 20 && result.freq <= 20000) {
      readings.push(result.freq);
    }
  }
  const noteMap = new Map<string, number[]>();
  for (const f of readings) {
    const info = frequencyToNote(f);
    const key = `${info.name}${info.octave}`;
    if (!noteMap.has(key)) noteMap.set(key, []);
    noteMap.get(key)!.push(f);
  }
  let bestKey = "";
  let bestCount = 0;
  for (const [key, freqs] of noteMap) {
    if (freqs.length > bestCount) { bestCount = freqs.length; bestKey = key; }
  }
  if (!bestKey) return { frequency: null, note: null };
  const freqs = noteMap.get(bestKey)!;
  freqs.sort((a, b) => a - b);
  const dominant = freqs[Math.floor(freqs.length / 2)];
  const rounded = Math.round(dominant * 10) / 10;
  const noteInfo = frequencyToNote(dominant);
  return { frequency: rounded, note: `${noteInfo.name}${noteInfo.octave}` };
}

async function analyzeViaServer(base64: string, ext: string): Promise<{ frequency: number | null; note: string | null } | null> {
  try {
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    if (!domain) return null;
    const apiUrl = `https://${domain}`;
    const resp = await fetch(new URL("/api/analyze-audio", apiUrl).href, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: base64, format: ext }),
    });
    if (resp.ok) return await resp.json();
    return null;
  } catch {
    return null;
  }
}

function frequencyToNote(freq: number): { name: string; octave: number; cents: number } {
  const semitones = 12 * Math.log2(freq / 440);
  const rounded = Math.round(semitones);
  const cents = Math.round((semitones - rounded) * 100);
  const noteIndex = ((rounded % 12) + 12 + 9) % 12;
  const octave = Math.floor((rounded + 9) / 12) + 4;
  return { name: NOTE_NAMES[noteIndex], octave, cents };
}

function fftPeakDetect(
  freqData: Float32Array,
  sampleRate: number,
  fftSize: number,
  minFreq: number = 27.5,
  maxFreq: number = 4200,
  noiseFloor: number = -60,
): { freq: number; peakBin: number } | null {
  const binRes = sampleRate / fftSize;
  const minBin = Math.max(1, Math.ceil(minFreq / binRes));
  const maxBin = Math.min(freqData.length - 2, Math.floor(maxFreq / binRes));
  if (minBin >= maxBin) return null;

  let peakVal = -Infinity;
  let peakIdx = -1;
  for (let i = minBin; i <= maxBin; i++) {
    if (freqData[i] > peakVal) {
      peakVal = freqData[i];
      peakIdx = i;
    }
  }
  if (peakIdx < 1 || peakVal < noiseFloor) return null;

  const alpha = freqData[peakIdx - 1];
  const beta = freqData[peakIdx];
  const gamma = freqData[peakIdx + 1];
  const denom = alpha - 2 * beta + gamma;
  let refinedBin = peakIdx;
  if (denom !== 0) {
    refinedBin = peakIdx + 0.5 * (alpha - gamma) / denom;
  }
  const freq = refinedBin * binRes;
  if (freq < minFreq || freq > maxFreq) return null;
  return { freq, peakBin: peakIdx };
}
import { useLanguage } from "@/contexts/LanguageContext";

const WAVE_CONFIGS: { type: WaveType; key: "sine" | "square" | "triangle" | "saw"; icon: string }[] = [
  { type: "sine", key: "sine", icon: "sine-wave" },
  { type: "square", key: "square", icon: "square-wave" },
  { type: "triangle", key: "triangle", icon: "triangle-wave" },
  { type: "sawtooth", key: "saw", icon: "sawtooth-wave" },
];

const OCTAVES = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const PICKER_ITEM_H = 36;
const PICKER_VISIBLE = 3;
const PICKER_H = PICKER_ITEM_H * PICKER_VISIBLE;

function noteToFreq(name: string, octave: number): number {
  const idx = NOTE_NAMES.indexOf(name);
  if (idx < 0) return 440;
  const semitones = (octave - 4) * 12 + (idx - 9);
  return Math.round(440 * Math.pow(2, semitones / 12) * 100) / 100;
}


const DEFAULT_KNOB_SIZE = 165;
const KNOB_STROKE = 5;
const ARC_START = 135;
const ARC_END = 405;
const ARC_RANGE = ARC_END - ARC_START;

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const VOLUME_LINEAR = 0.3;

function freqToNorm(freq: number): number {
  const logMin = Math.log10(MIN_FREQ);
  const logMax = Math.log10(MAX_FREQ);
  return (Math.log10(freq) - logMin) / (logMax - logMin);
}

function normToFreq(norm: number): number {
  const logMin = Math.log10(MIN_FREQ);
  const logMax = Math.log10(MAX_FREQ);
  return Math.pow(10, logMin + norm * (logMax - logMin));
}

function polarToXY(angleDeg: number, r: number, cx: number, cy: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

interface KnobProps {
  value: number;
  onChange: (v: number) => void;
  displayValue: string;
  displayUnit: string;
  accentColor: string;
  accentDim: string;
  onTapCenter?: () => void;
  onLongPress?: () => void;
  noteLabel?: string;
  knobSize?: number;
}

function Knob({ value, onChange, displayValue, displayUnit, accentColor, accentDim, onTapCenter, onLongPress, noteLabel, knobSize = DEFAULT_KNOB_SIZE }: KnobProps) {
  const { colors: C } = useTheme();
  const styles = make_styles(C);
  const knobRef = useRef<View>(null);
  const valRef = useRef(value);
  const startValRef = useRef(value);
  const movedRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  valRef.current = value;
  const knobRadius = knobSize / 2;
  const indicatorRadius = knobRadius - 14;

  const haptic = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        movedRef.current = false;
        longPressFiredRef.current = false;
        startValRef.current = valRef.current;
        haptic();
        if (onLongPress) {
          longPressTimerRef.current = setTimeout(() => {
            if (!movedRef.current) {
              longPressFiredRef.current = true;
              onLongPress();
            }
          }, 400);
        }
      },
      onPanResponderMove: (_, gs) => {
        if (Math.abs(gs.dy) > 3) {
          movedRef.current = true;
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
        }
        const sensitivity = 0.0015;
        const delta = -gs.dy * sensitivity;
        const next = Math.max(0, Math.min(1, startValRef.current + delta));
        if (Math.abs(next - valRef.current) > 0.001) {
          onChange(next);
        }
      },
      onPanResponderRelease: () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        if (!movedRef.current && !longPressFiredRef.current && onTapCenter) {
          onTapCenter();
        }
      },
    }), [onChange, haptic, onTapCenter, onLongPress]);

  const angle = ARC_START + value * ARC_RANGE;
  const indicator = polarToXY(angle, indicatorRadius, knobRadius, knobRadius);
  const dotR = Math.max(8, knobSize * 0.042);
  const valueFontSize = Math.max(18, knobSize * 0.17);
  const unitFontSize = Math.max(10, knobSize * 0.085);

  return (
    <View style={styles.knobContainer}>
      <View
        ref={knobRef}
        {...panResponder.panHandlers}
        style={[styles.knobOuter, { width: knobSize, height: knobSize }]}
      >
        <View style={[styles.knobBg, { width: knobSize, height: knobSize, borderRadius: knobRadius, borderColor: accentDim }]}>
          <View style={[styles.knobIndicatorDot, { backgroundColor: accentColor, width: dotR * 2, height: dotR * 2, borderRadius: dotR, left: indicator.x - dotR, top: indicator.y - dotR }]} />
        </View>
        <Pressable style={styles.knobCenter} onPress={onTapCenter}>
          <Text style={[styles.knobValue, { color: accentColor, fontSize: valueFontSize }]}>{displayValue}</Text>
          <Text style={[styles.knobUnit, { fontSize: unitFontSize }]}>{displayUnit}</Text>
          {noteLabel ? <Text style={[styles.knobNoteLabel, { color: accentColor }]}>{noteLabel}</Text> : null}
        </Pressable>
      </View>
    </View>
  );
}

function formatHz(freq: number): string {
  if (freq >= 10000) return (freq / 1000).toFixed(1) + "k";
  if (freq >= 1000) return (freq / 1000).toFixed(2) + "k";
  if (freq >= 100) return Math.round(freq).toString();
  return freq.toFixed(1);
}

function PickerColumn<T extends string | number>({
  data,
  selected,
  onSelect,
  accentColor,
  accentDim,
  renderLabel,
}: {
  data: T[];
  selected: T;
  onSelect: (item: T) => void;
  accentColor: string;
  accentDim: string;
  renderLabel?: (item: T) => string;
}) {
  const { colors: C } = useTheme();
  const pickerStyles = make_pickerStyles(C);
  const flatListRef = useRef<FlatList<T>>(null);
  const scrollingRef = useRef(false);
  const programmaticRef = useRef(false);
  const selectedIdx = data.indexOf(selected);

  useEffect(() => {
    if (!scrollingRef.current && selectedIdx >= 0) {
      programmaticRef.current = true;
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({
          offset: selectedIdx * PICKER_ITEM_H,
          animated: true,
        });
        setTimeout(() => { programmaticRef.current = false; }, 300);
      }, 50);
    }
  }, [selectedIdx]);

  const onMomentumEnd = useCallback(
    (e: any) => {
      if (programmaticRef.current) {
        scrollingRef.current = false;
        return;
      }
      const y = e.nativeEvent.contentOffset.y;
      const idx = Math.round(y / PICKER_ITEM_H);
      const clamped = Math.max(0, Math.min(data.length - 1, idx));
      if (data[clamped] !== selected) {
        onSelect(data[clamped]);
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      scrollingRef.current = false;
    },
    [data, selected, onSelect]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: PICKER_ITEM_H,
      offset: PICKER_ITEM_H * index,
      index,
    }),
    []
  );

  return (
    <View style={[pickerStyles.column, { height: PICKER_H }]}>
      <View style={[pickerStyles.highlight, { backgroundColor: accentDim, borderColor: accentColor }]} />
      <FlatList
        ref={flatListRef}
        data={data}
        keyExtractor={(item) => String(item)}
        showsVerticalScrollIndicator={false}
        snapToInterval={PICKER_ITEM_H}
        decelerationRate="fast"
        onScrollBeginDrag={() => { scrollingRef.current = true; }}
        onMomentumScrollEnd={onMomentumEnd}
        onScrollEndDrag={(e) => {
          if (Platform.OS === "web") onMomentumEnd(e);
        }}
        getItemLayout={getItemLayout}
        contentContainerStyle={{ paddingVertical: PICKER_ITEM_H }}
        renderItem={({ item }) => {
          const isSelected = item === selected;
          return (
            <Pressable
              onPress={() => { onSelect(item); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              style={pickerStyles.item}
            >
              <Text
                style={[
                  pickerStyles.itemText,
                  isSelected && { color: accentColor, fontFamily: "SpaceGrotesk_700Bold" },
                ]}
              >
                {renderLabel ? renderLabel(item) : String(item)}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const make_pickerStyles = (C: typeof Colors) => StyleSheet.create({
  column: {
    width: 90,
    overflow: "hidden",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  highlight: {
    position: "absolute",
    top: PICKER_ITEM_H,
    left: 0,
    right: 0,
    height: PICKER_ITEM_H,
    borderRadius: 8,
    borderWidth: 1,
    zIndex: 1,
    pointerEvents: "none",
  },
  item: {
    height: PICKER_ITEM_H,
    alignItems: "center",
    justifyContent: "center",
  },
  itemText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 16,
    color: C.textTertiary,
  },
});

interface TuningGuideModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectFreq: (freq: number) => void;
  lang: "ko" | "en";
  accentColor: string;
  accentDim: string;
}

function TuningGuideModal({ visible, onClose, onSelectFreq, lang, accentColor, accentDim }: TuningGuideModalProps) {
  const { colors: C } = useTheme();
  const S = useScale();
  const tgStyles = make_tgStyles(C);
  const styles = make_styles(C);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedInstrument, setExpandedInstrument] = useState<string | null>(null);
  const { t } = useLanguage();

  const handleClose = useCallback(() => {
    setExpandedCategory(null);
    setExpandedInstrument(null);
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <View style={tgStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={tgStyles.card}>
          <View style={tgStyles.header}>
            <MaterialCommunityIcons name="music-note-outline" size={S.ms(18, 0.4)} color={accentColor} />
            <Text style={[tgStyles.title, { color: accentColor }]}>{t("signalGenerator", "tuningGuide")}</Text>
            <Pressable onPress={handleClose} hitSlop={12} style={tgStyles.closeBtn}>
              <Ionicons name="close" size={S.ms(18, 0.4)} color={C.textSecondary} />
            </Pressable>
          </View>
          <Text style={tgStyles.hint}>{t("signalGenerator", "tapToSet")}</Text>
          <View style={tgStyles.divider} />
          <ScrollView style={tgStyles.scrollBody} showsVerticalScrollIndicator={false}>
            {TUNING_DATA.map((cat) => (
              <View key={cat.id}>
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setExpandedCategory(expandedCategory === cat.id ? null : cat.id);
                    setExpandedInstrument(null);
                  }}
                  style={[tgStyles.categoryRow, expandedCategory === cat.id && { backgroundColor: accentDim }]}
                >
                  <MaterialCommunityIcons
                    name={cat.icon}
                    size={S.ms(16, 0.4)}
                    color={expandedCategory === cat.id ? accentColor : C.textSecondary}
                  />
                  <Text style={[tgStyles.categoryText, expandedCategory === cat.id && { color: accentColor }]}>
                    {cat.name[lang]}
                  </Text>
                  <Ionicons
                    name={expandedCategory === cat.id ? "chevron-up" : "chevron-forward"}
                    size={S.ms(14, 0.4)}
                    color={C.textTertiary}
                  />
                </Pressable>

                {expandedCategory === cat.id && cat.instruments.map((inst) => (
                  <View key={inst.id}>
                    <Pressable
                      onPress={() => {
                        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setExpandedInstrument(expandedInstrument === inst.id ? null : inst.id);
                      }}
                      style={[tgStyles.instrumentRow, expandedInstrument === inst.id && { backgroundColor: C.overlay05 }]}
                    >
                      <Text style={[tgStyles.instrumentText, expandedInstrument === inst.id && { color: accentColor }]}>
                        {inst.name[lang]}
                      </Text>
                      <Ionicons
                        name={expandedInstrument === inst.id ? "chevron-down" : "chevron-forward"}
                        size={S.ms(12, 0.4)}
                        color={C.textTertiary}
                      />
                    </Pressable>

                    {expandedInstrument === inst.id && (
                      <View style={tgStyles.stringList}>
                        {inst.strings.map((s, i) => (
                          <Pressable
                            key={`${inst.id}-${i}`}
                            onPress={() => {
                              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              onSelectFreq(s.freq);
                            }}
                            hitSlop={4}
                            style={({ pressed }) => [
                              tgStyles.stringRow,
                              pressed && { backgroundColor: accentDim },
                            ]}
                          >
                            <Text style={[tgStyles.stringNote, { color: accentColor }]}>
                              {s.note}{s.octave}
                            </Text>
                            <Text style={tgStyles.stringLabel}>
                              {s.label[lang]}
                            </Text>
                            <Text style={tgStyles.stringFreq}>
                              {s.freq} Hz
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const make_tgStyles = (C: typeof Colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  card: {
    width: 320,
    maxHeight: "75%",
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 16,
    color: C.text,
    flex: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: C.textTertiary,
    marginTop: 4,
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginBottom: 8,
  },
  scrollBody: {
    flexGrow: 0,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  categoryText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: C.textSecondary,
    flex: 1,
  },
  instrumentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 24,
    borderRadius: 6,
  },
  instrumentText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: C.textSecondary,
    flex: 1,
  },
  stringList: {
    paddingLeft: 20,
    paddingBottom: 4,
  },
  stringRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    gap: 8,
  },
  stringNote: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 13,
    color: C.text,
    width: 36,
  },
  stringLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: C.textSecondary,
    flex: 1,
  },
  stringFreq: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: C.textTertiary,
  },
});

interface SignalGeneratorModalProps {
  visible: boolean;
  onClose: () => void;
  onAndroidMicToggle?: (active: boolean) => void;
  androidMicFrequency?: number | null;
  androidMicNote?: string | null;
}

export function SignalGeneratorModal({ visible, onClose, onAndroidMicToggle, androidMicFrequency, androidMicNote }: SignalGeneratorModalProps) {
  const { colors: C } = useTheme();
  const pickerStyles = make_pickerStyles(C);
  const tgStyles = make_tgStyles(C);
  const styles = make_styles(C);
  const { t, language: lang } = useLanguage();
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  const S = useScale();
  const isWeb = Platform.OS === "web";
  const webMaxCard = isWeb && S.isTablet ? Math.min(520, winW * 0.45) : 460;
  const dynamicKnobSize = isLandscape
    ? Math.min(Math.max(120, winH * 0.52), 280)
    : Math.min(Math.max(100, Math.min(S.minDim, webMaxCard) * 0.42), S.isTablet ? 280 : 240);
  const dynamicCardWidth = isLandscape
    ? Math.min(winW * 0.92, 1100)
    : Math.min(Math.max(300, S.screenWidth * 0.92), webMaxCard);
  const dynamicCardHeight = isLandscape ? winH * 0.88 : undefined;
  const landscapeGap = isLandscape ? Math.max(8, winW * 0.012) : 0;
  const landscapePadH = isLandscape ? Math.max(12, winW * 0.018) : 0;
  const landscapePadV = isLandscape ? Math.max(10, winH * 0.025) : 0;
  const cardPad = isLandscape ? undefined : Math.max(16, S.ms(20, 0.4));
  const cardGap = isLandscape ? undefined : Math.max(16, S.ms(18, 0.4));
  const micBtnSize = isLandscape ? 28 : Math.max(28, S.ms(30, 0.3));
  const micIconSize = isLandscape ? 14 : Math.max(14, S.ms(15, 0.3));
  const [frequency, setFrequency] = useState(440);
  const [waveType, setWaveType] = useState<WaveType>("sine");
  const [isPlaying, setIsPlaying] = useState(false);
  const [editingFreq, setEditingFreq] = useState(false);
  const [freqInput, setFreqInput] = useState("440");
  const [selectedNote, setSelectedNote] = useState("A");
  const [selectedOctave, setSelectedOctave] = useState(4);
  const [tuningGuideOpen, setTuningGuideOpen] = useState(false);
  const preGuideFreqRef = useRef<number | null>(null);
  const [pickerLockFlash, setPickerLockFlash] = useState(false);

  const pickerDrivenRef = useRef(false);

  const handleNoteSelect = useCallback((note: string) => {
    setSelectedNote(note);
    pickerDrivenRef.current = true;
    const f = noteToFreq(note, selectedOctave);
    if (f >= MIN_FREQ && f <= MAX_FREQ) setFrequency(f);
    setTimeout(() => { pickerDrivenRef.current = false; }, 150);
  }, [selectedOctave]);

  const handleOctaveSelect = useCallback((oct: number) => {
    setSelectedOctave(oct);
    pickerDrivenRef.current = true;
    const f = noteToFreq(selectedNote, oct);
    if (f >= MIN_FREQ && f <= MAX_FREQ) setFrequency(f);
    setTimeout(() => { pickerDrivenRef.current = false; }, 150);
  }, [selectedNote]);

  useEffect(() => {
    if (pickerDrivenRef.current) return;
    for (let oct = 0; oct <= 8; oct++) {
      for (const name of NOTE_NAMES) {
        const nf = noteToFreq(name, oct);
        if (Math.abs(frequency - nf) <= 1) {
          setSelectedNote(name);
          setSelectedOctave(oct);
          return;
        }
      }
    }
  }, [frequency]);

  const [micListening, setMicListening] = useState(false);
  const [micDetectedFreq, setMicDetectedFreq] = useState<number | null>(null);
  const [micDetectedNote, setMicDetectedNote] = useState<string | null>(null);
  const [micAnalyzed, setMicAnalyzed] = useState(false);
  const micTargetFreqRef = useRef<number>(440);
  const micHasTargetRef = useRef(false);
  const [micHasTarget, setMicHasTarget] = useState(false);
  const micDetectedFreqRef = useRef<number | null>(null);
  const micActiveRef = useRef(false);
  const micAudioCtxRef = useRef<any>(null);
  const micAnalyserRef = useRef<any>(null);
  const micSourceRef = useRef<any>(null);
  const micStreamRef = useRef<any>(null);
  const micRafRef = useRef<number | null>(null);
  const spectrumDataRef = useRef<Float32Array | null>(null);
  const spectrumPeakBinRef = useRef<number>(-1);
  const [spectrumTick, setSpectrumTick] = useState(0);
  const micRecordingRef = useRef<Audio.Recording | null>(null);
  const micMobileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeFailCountRef = useRef(0);
  const nativeFallenBackRef = useRef(false);
  const [micWebViewActive, setMicWebViewActive] = useState(false);

  const engineRef = useRef(new SignalGeneratorEngine());
  const isPlayingRef = useRef(false);
  const nativeSoundRef = useRef<Audio.Sound | null>(null);

  const hapticFeedback = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const stopNativeSound = useCallback(async () => {
    if (nativeSoundRef.current) {
      try { await nativeSoundRef.current.stopAsync(); } catch {}
      try { await nativeSoundRef.current.unloadAsync(); } catch {}
      nativeSoundRef.current = null;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    isPlayingRef.current = false;
    if (Platform.OS === "web") {
      engineRef.current.stopWeb();
    } else {
      stopNativeSound();
    }
    setIsPlaying(false);
  }, [stopNativeSound]);

  const startPlayback = useCallback(async () => {
    isPlayingRef.current = true;
    if (Platform.OS === "web") {
      await engineRef.current.startWeb(frequency, waveType, VOLUME_LINEAR);
    } else {
      try {
        await stopNativeSound();
        const base64 = generateToneBase64(frequency, waveType, VOLUME_LINEAR);
        const fileUri = (FileSystem.cacheDirectory || FileSystem.documentDirectory || "") + "signal_tone.wav";
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        const { sound } = await Audio.Sound.createAsync(
          { uri: fileUri },
          { isLooping: true, shouldPlay: true, volume: 1.0 }
        );
        nativeSoundRef.current = sound;
      } catch (e) {
        console.warn("[SignalGen] native playback error:", e);
      }
    }
    setIsPlaying(true);
  }, [frequency, waveType, stopNativeSound]);

  useEffect(() => {
    if (isPlaying && Platform.OS === "web") {
      engineRef.current.updateFrequency(frequency);
    }
  }, [frequency, isPlaying]);

  useEffect(() => {
    if (isPlaying && Platform.OS === "web") {
      engineRef.current.updateWaveType(waveType);
    }
  }, [waveType, isPlaying]);

  useEffect(() => {
    if (isPlaying && Platform.OS !== "web") {
      stopPlayback();
      setTimeout(() => startPlayback(), 50);
    }
  }, [frequency, waveType, isPlaying, stopPlayback, startPlayback]);

  useEffect(() => {
    return () => {
      engineRef.current.stopWeb();
      stopNativeSound();
      micActiveRef.current = false;
      setMicWebViewActive(false);
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      if (micSourceRef.current) micSourceRef.current.disconnect();
      if (micAudioCtxRef.current) micAudioCtxRef.current.close();
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach((t: any) => t.stop());
      if (micMobileTimerRef.current) clearTimeout(micMobileTimerRef.current);
      if (micRecordingRef.current) {
        try { micRecordingRef.current.stopAndUnloadAsync(); } catch {}
      }
    };
  }, []);


  const stopMicAndroid = useCallback(() => {
    setMicWebViewActive(false);
    onAndroidMicToggle?.(false);
  }, [onAndroidMicToggle]);

  const showMicPermissionAlert = useCallback(() => {
    Alert.alert(
      t("noteRecorder", "permissionRequired"),
      t("noteRecorder", "micPermission"),
    );
  }, [t]);

  const startMicAndroid = useCallback(async () => {
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      console.warn("[MicTuner] Mic permission denied");
      showMicPermissionAlert();
      return;
    }
    micActiveRef.current = true;
    setMicListening(true);
    setMicWebViewActive(true);
    onAndroidMicToggle?.(true);
  }, [onAndroidMicToggle, showMicPermissionAlert]);

  const stopMobileMic = useCallback(async () => {
    if (micMobileTimerRef.current) {
      clearTimeout(micMobileTimerRef.current);
      micMobileTimerRef.current = null;
    }
    if (micRecordingRef.current) {
      try {
        await micRecordingRef.current.stopAndUnloadAsync();
      } catch {}
      micRecordingRef.current = null;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, interruptionModeIOS: InterruptionModeIOS.MixWithOthers });
  }, []);

  const stopMic = useCallback(() => {
    micActiveRef.current = false;
    setMicListening(false);
    if (Platform.OS === "android") {
      stopMicAndroid();
      stopMobileMic();
      nativeFallenBackRef.current = false;
    } else if (Platform.OS === "web") {
      if (micRafRef.current) {
        cancelAnimationFrame(micRafRef.current);
        micRafRef.current = null;
      }
      if (micSourceRef.current) {
        micSourceRef.current.disconnect();
        micSourceRef.current = null;
      }
      if (micAudioCtxRef.current) {
        micAudioCtxRef.current.close();
        micAudioCtxRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t: any) => t.stop());
        micStreamRef.current = null;
      }
    } else {
      stopMobileMic();
    }
    setMicAnalyzed(false);
    spectrumDataRef.current = null;
    spectrumPeakBinRef.current = -1;
  }, [stopMobileMic, stopMicAndroid]);

  const pickDominantFreq = useCallback((readings: number[]): number | null => {
    if (readings.length === 0) return null;
    const noteMap = new Map<string, number[]>();
    for (const f of readings) {
      const info = frequencyToNote(f);
      const key = `${info.name}${info.octave}`;
      if (!noteMap.has(key)) noteMap.set(key, []);
      noteMap.get(key)!.push(f);
    }
    let bestKey = "";
    let bestCount = 0;
    for (const [key, freqs] of noteMap) {
      if (freqs.length > bestCount) {
        bestCount = freqs.length;
        bestKey = key;
      }
    }
    if (!bestKey) return null;
    const freqs = noteMap.get(bestKey)!;
    freqs.sort((a, b) => a - b);
    return freqs[Math.floor(freqs.length / 2)];
  }, []);

  const startMicWeb = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn("[MicTuner] getUserMedia not available");
        setMicListening(false);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: { ideal: 48000 },
          channelCount: 1,
        },
      });
      micStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000,
      });
      if (audioCtx.state === "suspended") await audioCtx.resume();
      micAudioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0;
      micAnalyserRef.current = analyser;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      micSourceRef.current = source;

      micActiveRef.current = true;
      setMicListening(true);

      const freqBinCount = analyser.frequencyBinCount;
      const fftBuf = new Float32Array(freqBinCount);
      const timeBuf = new Float32Array(analyser.fftSize);
      const spectrumCopy = new Float32Array(freqBinCount);
      const MIC_GATE = 0.03;
      const WINDOW_MS = 500;
      let readings: number[] = [];
      let windowStart = Date.now();
      let spectrumFrameCount = 0;

      const detect = () => {
        if (!micActiveRef.current) return;
        analyser.getFloatTimeDomainData(timeBuf);
        let rms = 0;
        for (let i = 0; i < timeBuf.length; i++) rms += timeBuf[i] * timeBuf[i];
        rms = Math.sqrt(rms / timeBuf.length);

        analyser.getFloatFrequencyData(fftBuf);
        spectrumCopy.set(fftBuf);
        spectrumDataRef.current = spectrumCopy;

        if (rms >= MIC_GATE) {
          const result = fftPeakDetect(fftBuf, audioCtx.sampleRate, analyser.fftSize);
          if (result) {
            spectrumPeakBinRef.current = result.peakBin;
            if (result.freq > 20 && result.freq <= MAX_FREQ) {
              readings.push(result.freq);
            }
          } else {
            spectrumPeakBinRef.current = -1;
          }
        } else {
          spectrumPeakBinRef.current = -1;
        }

        spectrumFrameCount++;
        if (spectrumFrameCount % 3 === 0) {
          setSpectrumTick(spectrumFrameCount);
        }

        const elapsed = Date.now() - windowStart;
        if (elapsed >= WINDOW_MS) {
          const dominant = pickDominantFreq(readings);
          setMicAnalyzed(true);
          if (dominant) {
            const rounded = Math.round(dominant * 10) / 10;
            setMicDetectedFreq(rounded);
            const noteInfo = frequencyToNote(dominant);
            setMicDetectedNote(`${noteInfo.name}${noteInfo.octave}`);
          } else {
            setMicDetectedFreq(null);
            setMicDetectedNote(null);
          }
          readings = [];
          windowStart = Date.now();
        }

        micRafRef.current = requestAnimationFrame(detect);
      };
      detect();
    } catch (e) {
      console.warn("[MicTuner] Web mic error:", e);
      setMicListening(false);
    }
  }, [pickDominantFreq]);

  useEffect(() => {
    if (!micWebViewActive || Platform.OS !== "android") return;
    setMicAnalyzed(true);
    if (androidMicFrequency) {
      setMicDetectedFreq(androidMicFrequency);
      setMicDetectedNote(androidMicNote ?? null);
    } else {
      setMicDetectedFreq(null);
      setMicDetectedNote(null);
    }
  }, [micWebViewActive, androidMicFrequency, androidMicNote]);

  const autoFallbackToWebView = useCallback(async () => {
    if (Platform.OS !== "android" || nativeFallenBackRef.current) return;
    nativeFallenBackRef.current = true;
    console.warn("[MicTuner] Native decode failed, auto-falling back to WebView");
    stopMobileMic();
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      console.warn("[MicTuner] Mic permission denied during fallback");
      showMicPermissionAlert();
      micActiveRef.current = false;
      setMicListening(false);
      return;
    }
    micActiveRef.current = true;
    setMicListening(true);
    setMicWebViewActive(true);
    onAndroidMicToggle?.(true);
  }, [stopMobileMic, onAndroidMicToggle, showMicPermissionAlert]);

  const startMicMobile = useCallback(async () => {
    nativeFailCountRef.current = 0;
    nativeFallenBackRef.current = false;
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        console.warn("[MicTuner] Mic permission denied");
        showMicPermissionAlert();
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      });

      micActiveRef.current = true;
      setMicListening(true);

      const RECORD_MS = 600;
      const SAMPLE_RATE = 48000;

      const recordingOptions = {
        isMeteringEnabled: false,
        ios: {
          extension: ".wav",
          outputFormat: (Audio as any).IOSOutputFormat?.LINEARPCM ?? 1819304813,
          audioQuality: (Audio as any).IOSAudioQuality?.MAX ?? 127,
          sampleRate: SAMPLE_RATE,
          numberOfChannels: 1,
          bitRate: 768000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        android: {
          extension: ".m4a",
          outputFormat: 2,
          audioEncoder: 3,
          sampleRate: SAMPLE_RATE,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        web: { mimeType: "audio/wav", bitsPerSecond: 768000 },
      };

      const recordAndAnalyze = async () => {
        if (!micActiveRef.current) return;
        let rec: Audio.Recording | null = null;
        try {
          const result = await Audio.Recording.createAsync(recordingOptions);
          rec = result.recording;
          micRecordingRef.current = rec;

          micMobileTimerRef.current = setTimeout(async () => {
            if (!micActiveRef.current) {
              if (rec) { try { await rec.stopAndUnloadAsync(); } catch {} }
              micRecordingRef.current = null;
              return;
            }
            try {
              await rec!.stopAndUnloadAsync();
              const uri = rec!.getURI();
              micRecordingRef.current = null;
              if (uri) {
                const base64 = await FileSystem.readAsStringAsync(uri, {
                  encoding: "base64" as any,
                });
                let analysisResult: { frequency: number | null; note: string | null };
                if (Platform.OS === "android") {
                  const serverResult = await analyzeViaServer(base64, ".m4a");
                  analysisResult = serverResult ?? { frequency: null, note: null };
                } else {
                  analysisResult = analyzeWavLocally(base64, SAMPLE_RATE);
                }
                setMicAnalyzed(true);
                if (analysisResult.frequency) {
                  nativeFailCountRef.current = 0;
                  setMicDetectedFreq(analysisResult.frequency);
                  setMicDetectedNote(analysisResult.note);
                } else {
                  if (Platform.OS === "android") {
                    nativeFailCountRef.current++;
                    if (nativeFailCountRef.current >= 3) {
                      autoFallbackToWebView();
                      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
                      return;
                    }
                  }
                  setMicDetectedFreq(null);
                  setMicDetectedNote(null);
                }
                try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
              }
            } catch (e) {
              console.warn("[MicTuner] native analyze error:", e);
            }
            if (micActiveRef.current) {
              recordAndAnalyze();
            }
          }, RECORD_MS);
        } catch (e) {
          console.warn("[MicTuner] native record error:", e);
          if (rec) {
            try { await rec.stopAndUnloadAsync(); } catch {}
          }
          micRecordingRef.current = null;
          if (Platform.OS === "android") {
            autoFallbackToWebView();
            return;
          }
          if (micActiveRef.current) {
            micMobileTimerRef.current = setTimeout(recordAndAnalyze, 500);
          }
        }
      };

      recordAndAnalyze();
    } catch (e) {
      console.warn("[MicTuner] Mobile start error:", e);
      setMicListening(false);
    }
  }, [startMicAndroid, autoFallbackToWebView, showMicPermissionAlert]);

  const startMic = useCallback(async () => {
    if (Platform.OS === "web") {
      startMicWeb();
    } else {
      startMicMobile();
    }
  }, [startMicWeb, startMicMobile]);

  const toggleMic = useCallback(() => {
    hapticFeedback();
    if (micListening) {
      stopMic();
    } else {
      micHasTargetRef.current = false;
      setMicHasTarget(false);
      micTargetFreqRef.current = frequency;
      startMic();
    }
  }, [micListening, stopMic, startMic, hapticFeedback, frequency]);

  const handleClose = useCallback(() => {
    stopPlayback();
    stopMic();
    onClose();
  }, [stopPlayback, stopMic, onClose]);

  const handleFreqKnob = useCallback((norm: number) => {
    const f = normToFreq(norm);
    setFrequency(Math.round(f * 10) / 10);
  }, []);

  const freqNorm = freqToNorm(frequency);

  const currentNote = useMemo(() => frequencyToNote(frequency), [frequency]);
  const currentNoteLabel = `${currentNote.name}${currentNote.octave}`;

  useEffect(() => { micDetectedFreqRef.current = micDetectedFreq; }, [micDetectedFreq]);

  const prevFreqForMicRef = useRef(frequency);
  useEffect(() => {
    if (micListening && prevFreqForMicRef.current !== frequency) {
      micHasTargetRef.current = true;
      setMicHasTarget(true);
      micTargetFreqRef.current = frequency;
    }
    prevFreqForMicRef.current = frequency;
  }, [frequency, micListening]);

  const clearPitchTarget = useCallback(() => {
    hapticFeedback();
    micHasTargetRef.current = false;
    setMicHasTarget(false);
  }, [hapticFeedback]);

  const pitchComparison = useMemo(() => {
    if (!micListening || !micDetectedFreq || !micHasTarget) return null;
    const target = micTargetFreqRef.current;
    const centsDiff = Math.round(1200 * Math.log2(micDetectedFreq / target));
    const targetNote = frequencyToNote(target);
    const targetLabel = `${targetNote.name}${targetNote.octave}`;
    if (Math.abs(centsDiff) <= 5) return { status: "exact" as const, cents: centsDiff, targetLabel };
    if (centsDiff > 0) return { status: "high" as const, cents: centsDiff, targetLabel };
    return { status: "low" as const, cents: centsDiff, targetLabel };
  }, [micListening, micDetectedFreq, micHasTarget]);

  const formatFreqDisplay = (f: number) => {
    if (f >= 1000) return (f / 1000).toFixed(f >= 10000 ? 1 : 2);
    return f >= 100 ? Math.round(f).toString() : f.toFixed(1);
  };

  const freqDisplayUnit = frequency >= 1000 ? "kHz" : t("signalGenerator", "hzUnit");

  const commitFreqInput = useCallback(() => {
    setEditingFreq(false);
    const val = parseFloat(freqInput);
    if (!isNaN(val) && val >= MIN_FREQ && val <= MAX_FREQ) {
      setFrequency(Math.round(val * 10) / 10);
    }
  }, [freqInput]);

  const openFreqEdit = useCallback(() => {
    setFreqInput(String(frequency));
    setEditingFreq(true);
  }, [frequency]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border, width: dynamicCardWidth }, !isLandscape && { padding: cardPad, gap: cardGap }, isLandscape && { paddingVertical: landscapePadV, paddingHorizontal: landscapePadH, height: dynamicCardHeight, maxHeight: "95%" as const, alignItems: "stretch" as const }]}>
          {isLandscape && (
            <Pressable onPress={handleClose} hitSlop={12} style={{ position: "absolute" as const, top: landscapePadV * 0.6, right: landscapePadH * 0.6, zIndex: 10 }}>
              <Ionicons name="close" size={S.ms(20, 0.4)} color={C.textSecondary} />
            </Pressable>
          )}
          {!isLandscape && (
            <>
              <View style={styles.header}>
                <MaterialCommunityIcons name="waveform" size={S.ms(20, 0.4)} color={C.accent} />
                <Text style={[styles.title, { color: C.accent }]}>{t("signalGenerator", "title")}</Text>
                <Pressable onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
                  <Ionicons name="close" size={S.ms(20, 0.4)} color={C.textSecondary} />
                </Pressable>
              </View>
              <View style={[styles.divider, { backgroundColor: C.border }]} />
            </>
          )}

          <View style={isLandscape ? { flexDirection: "row" as const, gap: landscapeGap, alignItems: "stretch" as const, flex: 1 } : undefined}>
          {isLandscape && (
            <View style={{ flex: 1 }}>
              <SpectrumGraph
                spectrumData={spectrumDataRef.current}
                peakBin={spectrumPeakBinRef.current}
                sampleRate={micAudioCtxRef.current?.sampleRate ?? 48000}
                fftSize={micAnalyserRef.current?.fftSize ?? 8192}
                accentColor={C.accent}
                surfaceColor={C.surfaceLight}
                textColor={C.textTertiary}
                tick={spectrumTick}
                micActive={micListening}
              />
            </View>
          )}
          <View style={[styles.knobMicContainer, isLandscape && { flex: 1 }]}>
            <View style={styles.knobWrap}>
              <Knob
                value={freqNorm}
                onChange={handleFreqKnob}
                displayValue={formatFreqDisplay(frequency)}
                displayUnit={freqDisplayUnit}
                accentColor={C.accent}
                accentDim={C.accentDim}
                onTapCenter={openFreqEdit}
                onLongPress={micListening && micDetectedFreqRef.current ? () => {
                  const captured = micDetectedFreqRef.current;
                  if (captured) {
                    hapticFeedback();
                    setFrequency(captured);
                  }
                } : undefined}
                noteLabel={currentNoteLabel}
                knobSize={dynamicKnobSize}
              />
              <Pressable
                onPress={toggleMic}
                style={[
                  styles.micEmoji,
                  micListening && styles.micEmojiActive,
                  {
                    position: "absolute" as const,
                    bottom: isLandscape ? -6 : -8,
                    right: isLandscape ? -10 : -14,
                    width: micBtnSize,
                    height: micBtnSize,
                    borderRadius: micBtnSize / 2,
                    zIndex: 10,
                  },
                ]}
                hitSlop={8}
                testID="signal-mic-toggle"
                accessibilityLabel={t("signalGenerator", "tunerMic")}
              >
                <MaterialCommunityIcons
                  name={micListening ? "microphone-off" : "microphone"}
                  size={micIconSize}
                  color={micListening ? C.danger : C.textSecondary}
                />
              </Pressable>
            </View>
            {(micDetectedFreq || micListening) && (
            <View style={[styles.micSection, isLandscape && { gap: 4 }]}>
              {micDetectedFreq ? (
                <View style={[styles.micDetectedWrap, isLandscape && { marginTop: 2 }]}>
                  <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: 4, flexWrap: "wrap" as const, justifyContent: "center" as const }}>
                    <Text style={[styles.micDetectedHint, { color: micListening ? C.accent : C.textTertiary }, isLandscape && { fontSize: 10 }]}>
                      {micDetectedFreq} {t("signalGenerator", "hzUnit")}
                    </Text>
                    <Text style={[styles.micDetectedHint, { color: micListening ? C.accent : C.textTertiary, opacity: 0.6 }, isLandscape && { fontSize: 10 }]}>|</Text>
                    <Text style={[styles.micDetectedHint, { color: micListening ? C.accent : C.textTertiary, fontWeight: "700" as const }, isLandscape && { fontSize: 10 }]}>
                      {micDetectedNote}
                    </Text>
                  </View>
                  {micListening && pitchComparison ? (
                    <View style={[
                      styles.pitchIndicator,
                      isLandscape && { paddingHorizontal: 6, paddingVertical: 2 },
                      {
                        backgroundColor: pitchComparison.status === "exact"
                          ? "rgba(48,209,88,0.15)"
                          : pitchComparison.status === "high"
                          ? "rgba(255,159,10,0.15)"
                          : "rgba(100,149,237,0.15)",
                        borderColor: pitchComparison.status === "exact"
                          ? "rgba(48,209,88,0.4)"
                          : pitchComparison.status === "high"
                          ? "rgba(255,159,10,0.4)"
                          : "rgba(100,149,237,0.4)",
                      }
                    ]}>
                      <Ionicons
                        name={
                          pitchComparison.status === "exact"
                            ? "checkmark-circle"
                            : pitchComparison.status === "high"
                            ? "arrow-up"
                            : "arrow-down"
                        }
                        size={isLandscape ? 10 : 12}
                        color={
                          pitchComparison.status === "exact"
                            ? "#30D158"
                            : pitchComparison.status === "high"
                            ? "#FF9F0A"
                            : "#6495ED"
                        }
                      />
                      <Text style={[
                        styles.pitchIndicatorText,
                        isLandscape && { fontSize: 9 },
                        {
                          color: pitchComparison.status === "exact"
                            ? "#30D158"
                            : pitchComparison.status === "high"
                            ? "#FF9F0A"
                            : "#6495ED",
                        }
                      ]}>
                        {pitchComparison.status === "exact"
                          ? `${t("signalGenerator", "pitchExact")} (${pitchComparison.targetLabel})`
                          : pitchComparison.status === "high"
                          ? `${t("signalGenerator", "pitchHigh")} +${pitchComparison.cents}¢`
                          : `${t("signalGenerator", "pitchLow")} ${pitchComparison.cents}¢`}
                      </Text>
                      <Pressable onPress={clearPitchTarget} hitSlop={8} style={{ marginLeft: 2 }}>
                        <Ionicons name="close-circle" size={isLandscape ? 12 : 14} color={C.textTertiary} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : micListening ? (
                <Text style={[styles.micDetectedHint, isLandscape && { fontSize: 10 }]}>
                  {micAnalyzed ? t("signalGenerator", "noSignal") : t("signalGenerator", "detecting")}
                </Text>
              ) : null}
            </View>
            )}
          </View>

          {!isLandscape && <View style={{ height: Math.max(14, S.ms(16, 0.4)) }} />}

          {isLandscape ? (
            <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "space-between" as const, gap: 6, paddingVertical: 2 }}>
            {editingFreq && (
              <View style={[styles.freqEditRow, { paddingHorizontal: 10, paddingVertical: 5 }]}>
                <TextInput
                  style={[styles.freqEditInput, { color: C.accent, borderBottomColor: C.accent, fontSize: 16, minWidth: 70 }]}
                  value={freqInput}
                  onChangeText={setFreqInput}
                  onSubmitEditing={commitFreqInput}
                  onBlur={commitFreqInput}
                  keyboardType="numeric"
                  autoFocus
                  selectTextOnFocus
                />
                <Text style={[styles.freqEditUnit, { fontSize: 13 }]}>{t("signalGenerator", "hzUnit")}</Text>
              </View>
            )}

            <View style={styles.notePickerRow}>
              <PickerColumn
                data={NOTE_NAMES}
                selected={selectedNote}
                onSelect={handleNoteSelect}
                accentColor={C.accent}
                accentDim={C.accentDim}
              />
              <PickerColumn
                data={OCTAVES}
                selected={selectedOctave}
                onSelect={handleOctaveSelect}
                accentColor={C.accent}
                accentDim={C.accentDim}
              />
            </View>
            <Pressable
              onLongPress={() => {
                const f = noteToFreq(selectedNote, selectedOctave);
                setFrequency(f);
                preGuideFreqRef.current = null;
                if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setPickerLockFlash(true);
                setTimeout(() => setPickerLockFlash(false), 600);
              }}
              delayLongPress={400}
              hitSlop={8}
            >
              <Text style={[styles.pickerHzHint, pickerLockFlash && { color: C.accent }]}>
                {pickerLockFlash ? "✓ " : ""}{noteToFreq(selectedNote, selectedOctave)} {t("signalGenerator", "hzUnit")}
              </Text>
            </Pressable>

            <View style={[styles.waveSection, { gap: 0 }]}>
              <View style={styles.waveRow}>
                {WAVE_CONFIGS.map((w) => {
                  const active = waveType === w.type;
                  return (
                    <Pressable
                      key={w.type}
                      onPress={() => { hapticFeedback(); setWaveType(w.type); }}
                      style={[styles.waveBtn, active && { backgroundColor: C.accentDim, borderColor: C.accent }, { paddingHorizontal: 8, paddingVertical: 5 }]}
                    >
                      <MaterialCommunityIcons
                        name={w.icon as any}
                        size={S.ms(15, 0.4)}
                        color={active ? C.accent : C.textTertiary}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable
              onPress={() => {
                hapticFeedback();
                setTuningGuideOpen(true);
              }}
              onLongPress={() => {
                if (preGuideFreqRef.current !== null) {
                  if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  setFrequency(preGuideFreqRef.current);
                  preGuideFreqRef.current = null;
                }
              }}
              delayLongPress={400}
              style={[styles.tuningGuideToggle, { marginTop: 0, marginBottom: 0 }]}
            >
              <MaterialCommunityIcons name="music-note-outline" size={S.ms(12, 0.4)} color={C.textTertiary} />
              <Text style={[styles.tuningGuideToggleText, { fontSize: 10 }]}>
                {t("signalGenerator", "tuningGuide")}
              </Text>
              <Ionicons name="chevron-forward" size={S.ms(12, 0.4)} color={C.textTertiary} />
            </Pressable>

            <TuningGuideModal
              visible={tuningGuideOpen}
              onClose={() => setTuningGuideOpen(false)}
              onSelectFreq={(freq) => {
                if (preGuideFreqRef.current === null) preGuideFreqRef.current = frequency;
                setFrequency(freq);
                setTuningGuideOpen(false);
              }}
              lang={lang}
              accentColor={C.accent}
              accentDim={C.accentDim}
            />

            <Pressable
              onPress={() => {
                hapticFeedback();
                isPlaying ? stopPlayback() : startPlayback();
              }}
              style={({ pressed }) => [
                styles.playBtn,
                { backgroundColor: isPlaying ? C.danger : C.accent, alignSelf: "stretch" as const, paddingVertical: 7, paddingHorizontal: 0, borderRadius: 10, justifyContent: "center" as const },
                pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
              ]}
              testID="signal-toggle"
            >
              <Ionicons
                name={isPlaying ? "stop" : "play"}
                size={S.ms(16, 0.4)}
                color={isPlaying ? C.white : C.background}
              />
            </Pressable>
            </View>
          ) : (
            <View style={{ alignItems: "center" as const, gap: Math.max(18, S.ms(20, 0.4)), width: "100%" as const }}>
            {editingFreq && (
              <View style={styles.freqEditRow}>
                <TextInput
                  style={[styles.freqEditInput, { color: C.accent, borderBottomColor: C.accent }]}
                  value={freqInput}
                  onChangeText={setFreqInput}
                  onSubmitEditing={commitFreqInput}
                  onBlur={commitFreqInput}
                  keyboardType="numeric"
                  autoFocus
                  selectTextOnFocus
                />
                <Text style={styles.freqEditUnit}>{t("signalGenerator", "hzUnit")}</Text>
              </View>
            )}

            <View style={styles.notePickerRow}>
              <PickerColumn
                data={NOTE_NAMES}
                selected={selectedNote}
                onSelect={handleNoteSelect}
                accentColor={C.accent}
                accentDim={C.accentDim}
              />
              <PickerColumn
                data={OCTAVES}
                selected={selectedOctave}
                onSelect={handleOctaveSelect}
                accentColor={C.accent}
                accentDim={C.accentDim}
              />
            </View>
            <Pressable
              onLongPress={() => {
                const f = noteToFreq(selectedNote, selectedOctave);
                setFrequency(f);
                preGuideFreqRef.current = null;
                if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setPickerLockFlash(true);
                setTimeout(() => setPickerLockFlash(false), 600);
              }}
              delayLongPress={400}
              hitSlop={8}
            >
              <Text style={[styles.pickerHzHint, pickerLockFlash && { color: C.accent }]}>
                {pickerLockFlash ? "✓ " : ""}{noteToFreq(selectedNote, selectedOctave)} {t("signalGenerator", "hzUnit")}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                hapticFeedback();
                setTuningGuideOpen(true);
              }}
              onLongPress={() => {
                if (preGuideFreqRef.current !== null) {
                  if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  setFrequency(preGuideFreqRef.current);
                  preGuideFreqRef.current = null;
                }
              }}
              delayLongPress={400}
              style={[styles.tuningGuideToggle]}
            >
              <MaterialCommunityIcons name="music-note-outline" size={S.ms(14, 0.4)} color={C.textTertiary} />
              <Text style={styles.tuningGuideToggleText}>
                {t("signalGenerator", "tuningGuide")}
              </Text>
              <Ionicons name="chevron-forward" size={S.ms(14, 0.4)} color={C.textTertiary} />
            </Pressable>

            <TuningGuideModal
              visible={tuningGuideOpen}
              onClose={() => setTuningGuideOpen(false)}
              onSelectFreq={(freq) => {
                if (preGuideFreqRef.current === null) preGuideFreqRef.current = frequency;
                setFrequency(freq);
                setTuningGuideOpen(false);
              }}
              lang={lang}
              accentColor={C.accent}
              accentDim={C.accentDim}
            />

            <View style={styles.waveSection}>
              <Text style={styles.sectionLabel}>{t("signalGenerator", "waveform")}</Text>
              <View style={styles.waveRow}>
                {WAVE_CONFIGS.map((w) => {
                  const active = waveType === w.type;
                  return (
                    <Pressable
                      key={w.type}
                      onPress={() => { hapticFeedback(); setWaveType(w.type); }}
                      style={[styles.waveBtn, active && { backgroundColor: C.accentDim, borderColor: C.accent }]}
                    >
                      <MaterialCommunityIcons
                        name={w.icon as any}
                        size={S.ms(20, 0.4)}
                        color={active ? C.accent : C.textTertiary}
                      />
                      <Text style={[styles.waveBtnText, active && { color: C.accent }]}>{t("signalGenerator", w.key)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Pressable
              onPress={() => {
                hapticFeedback();
                isPlaying ? stopPlayback() : startPlayback();
              }}
              style={({ pressed }) => [
                styles.playBtn,
                { backgroundColor: isPlaying ? C.danger : C.accent },
                pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
              ]}
              testID="signal-toggle"
            >
              <Ionicons
                name={isPlaying ? "stop" : "play"}
                size={S.ms(20, 0.4)}
                color={isPlaying ? C.white : C.background}
              />
              <Text style={[styles.playBtnText, { color: isPlaying ? C.white : C.background }]}>
                {isPlaying ? t("signalGenerator", "stop") : t("signalGenerator", "play")}
              </Text>
            </Pressable>
            </View>
          )}
          </View>


        </View>
      </View>
    </Modal>
  );
}

const BUBBLE_COUNT = 3;
const LERP_GROW = 0.22;
const LERP_SHRINK = 0.03;
const HOLD_MS = 1200;

function noteNameFromFreq(freq: number): string {
  if (freq <= 0) return "";
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const midi = 69 + 12 * Math.log2(freq / 440);
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  const noteIdx = ((rounded % 12) + 12) % 12;
  return `${noteNames[noteIdx]}${octave}`;
}

interface BubbleState {
  freq: number;
  size: number;
  isPrimary: boolean;
}

function SpectrumGraph({
  spectrumData,
  peakBin,
  sampleRate,
  fftSize,
  accentColor,
  surfaceColor,
  textColor,
  tick: _tick,
  micActive,
}: {
  spectrumData: Float32Array | null;
  peakBin: number;
  sampleRate: number;
  fftSize: number;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  tick: number;
  micActive: boolean;
}) {
  const binRes = sampleRate / fftSize;
  const hasData = !!(micActive && spectrumData);

  const targetRef = useRef<BubbleState[]>(Array.from({ length: BUBBLE_COUNT }, () => ({ freq: 0, size: 0, isPrimary: false })));
  const animRef = useRef<BubbleState[]>(Array.from({ length: BUBBLE_COUNT }, () => ({ freq: 0, size: 0, isPrimary: false })));
  const holdRef = useRef<BubbleState[]>(Array.from({ length: BUBBLE_COUNT }, () => ({ freq: 0, size: 0, isPrimary: false })));
  const holdTimeRef = useRef<number[]>(Array.from({ length: BUBBLE_COUNT }, () => 0));
  const [display, setDisplay] = useState<BubbleState[]>(Array.from({ length: BUBBLE_COUNT }, () => ({ freq: 0, size: 0, isPrimary: false })));
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  if (hasData && spectrumData) {
    const minBin = Math.max(1, Math.ceil(27.5 / binRes));
    const maxBin = Math.min(spectrumData.length - 1, Math.floor(4200 / binRes));

    const candidates: { bin: number; mag: number }[] = [];
    for (let b = minBin + 1; b < maxBin; b++) {
      if (spectrumData[b] > spectrumData[b - 1] && spectrumData[b] > spectrumData[b + 1] && spectrumData[b] > -60) {
        candidates.push({ bin: b, mag: spectrumData[b] });
      }
    }
    candidates.sort((a, b) => b.mag - a.mag);

    const topN = candidates.slice(0, BUBBLE_COUNT);
    const maxMag = topN.length > 0 ? topN[0].mag : -100;

    const newTargets: BubbleState[] = [];
    for (const c of topN) {
      const normalized = Math.max(0.1, Math.min(1, (c.mag - (-100)) / (maxMag - (-100) + 1)));
      newTargets.push({
        freq: c.bin * binRes,
        size: normalized,
        isPrimary: c.bin === peakBin,
      });
    }
    newTargets.sort((a, b) => b.size - a.size);
    while (newTargets.length < BUBBLE_COUNT) {
      newTargets.push({ freq: 0, size: 0, isPrimary: false });
    }

    const now = performance.now();
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const prev = targetRef.current[i];
      const next = newTargets[i];
      if (next.freq > 0 && next.size > 0) {
        holdRef.current[i] = { ...next };
        holdTimeRef.current[i] = now;
      } else if (prev.freq > 0 && next.freq <= 0) {
        holdTimeRef.current[i] = holdTimeRef.current[i] || now;
      }
    }
    targetRef.current = newTargets;
  } else {
    const now = performance.now();
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      if (targetRef.current[i].freq > 0 && holdTimeRef.current[i] === 0) {
        holdTimeRef.current[i] = now;
      }
    }
    targetRef.current = Array.from({ length: BUBBLE_COUNT }, () => ({ freq: 0, size: 0, isPrimary: false }));
  }

  useEffect(() => {
    let lastTime = performance.now();
    const animate = (now: number) => {
      if (!mountedRef.current) return;
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;

      const targets = targetRef.current;
      const anims = animRef.current;
      let changed = false;

      for (let i = 0; i < BUBBLE_COUNT; i++) {
        let t = targets[i];
        const a = anims[i];

        const shrinking = t.size < a.size || (t.freq <= 0 && a.freq > 0);
        if (shrinking) {
          const elapsed = now - holdTimeRef.current[i];
          if (elapsed < HOLD_MS && holdRef.current[i].freq > 0) {
            t = holdRef.current[i];
          }
        }

        const speed = shrinking ? LERP_SHRINK : LERP_GROW;
        const factor = 1 - Math.pow(1 - speed, dt / 16.67);

        const newFreq = a.freq + (t.freq - a.freq) * factor;
        const newSize = a.size + (t.size - a.size) * factor;

        if (Math.abs(newFreq - a.freq) > 0.1 || Math.abs(newSize - a.size) > 0.001) {
          changed = true;
        }

        anims[i] = {
          freq: Math.abs(t.freq - newFreq) < 0.5 ? t.freq : newFreq,
          size: Math.abs(t.size - newSize) < 0.002 ? t.size : newSize,
          isPrimary: t.isPrimary,
        };
      }

      if (changed) {
        setDisplay(anims.map(a => ({ ...a })));
      }

      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const formatFreq = (f: number) => {
    if (f <= 0) return "";
    if (f >= 1000) return `${(f / 1000).toFixed(1)}k`;
    return `${Math.round(f)}`;
  };

  const containerRef = useRef<View>(null);
  const [containerSize, setContainerSize] = useState({ w: 120, h: 120 });

  return (
    <View
      ref={containerRef}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) setContainerSize({ w: width, h: height });
      }}
      style={{ flex: 1, backgroundColor: surfaceColor, borderRadius: 12, overflow: "hidden" as const, opacity: hasData ? 1 : 0.3 }}
    >
      <View style={{ flex: 1, position: "relative" as const }}>
        {display.map((b, i) => {
          if (b.freq <= 0 && b.size <= 0) return null;

          const maxBubbleR = Math.min(containerSize.w, containerSize.h) * 0.38;
          const minBubbleR = 8;
          const radius = minBubbleR + b.size * (maxBubbleR - minBubbleR);
          const diameter = radius * 2;

          const cx = containerSize.w * (i === 0 ? 0.5 : i === 1 ? 0.25 : 0.75);
          const cy = containerSize.h * (i === 0 ? 0.42 : 0.55);

          const freqLabel = formatFreq(b.freq);
          const noteLabel = noteNameFromFreq(b.freq);
          const opacity = Math.max(0.3, b.size);
          const isLarge = diameter > 40;

          return (
            <View
              key={i}
              style={{
                position: "absolute" as const,
                left: cx - radius,
                top: cy - radius,
                width: diameter,
                height: diameter,
                borderRadius: radius,
                backgroundColor: b.isPrimary ? accentColor : `${accentColor}88`,
                opacity,
                alignItems: "center" as const,
                justifyContent: "center" as const,
              }}
            >
              {isLarge && freqLabel ? (
                <View style={{ alignItems: "center" as const }}>
                  <Text style={{ fontSize: Math.min(12, diameter * 0.2), color: "#fff", fontFamily: "SpaceGrotesk_700Bold", textAlign: "center" as const }} numberOfLines={1}>
                    {freqLabel} Hz
                  </Text>
                  {noteLabel ? (
                    <Text style={{ fontSize: Math.min(9, diameter * 0.14), color: "rgba(255,255,255,0.75)", fontFamily: "SpaceGrotesk_500Medium", marginTop: 1 }} numberOfLines={1}>
                      {noteLabel}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
        {!hasData && (
          <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "center" as const }}>
            <Text style={{ fontSize: 10, color: textColor, fontFamily: "SpaceGrotesk_400Regular", opacity: 0.5 }}>Mic off</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const make_styles = (C: typeof Colors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.border,
    gap: 18,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  title: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 18,
    color: C.text,
    flex: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    opacity: 0.5,
    width: "100%",
  },
  knobContainer: {
    alignItems: "center",
  },
  knobOuter: {
    width: DEFAULT_KNOB_SIZE,
    height: DEFAULT_KNOB_SIZE,
  },
  knobBg: {
    width: DEFAULT_KNOB_SIZE,
    height: DEFAULT_KNOB_SIZE,
    borderRadius: DEFAULT_KNOB_SIZE / 2,
    borderWidth: KNOB_STROKE,
    backgroundColor: C.surfaceLight,
  },
  knobIndicatorDot: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  knobCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  knobValue: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 28,
    lineHeight: 32,
    color: C.text,
  },
  knobUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: C.textTertiary,
    lineHeight: 18,
  },
  knobNoteLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 11,
    color: C.text,
    opacity: 0.7,
    marginTop: 2,
    lineHeight: 14,
  },
  freqEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  freqEditInput: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 20,
    color: C.text,
    borderBottomWidth: 2,
    paddingVertical: 4,
    minWidth: 100,
    textAlign: "center",
  },
  freqEditUnit: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 16,
    color: C.textTertiary,
  },
  freqTapBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  freqTapText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: C.text,
  },
  sectionLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
    color: C.textTertiary,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  notePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: C.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignSelf: "center",
  },
  pickerHzHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: C.textTertiary,
    opacity: 0.6,
    marginLeft: 6,
  },
  waveSection: {
    width: "100%",
    alignItems: "center",
  },
  waveRow: {
    flexDirection: "row",
    gap: 6,
  },
  waveBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  waveBtnText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
    color: C.textTertiary,
    letterSpacing: 0.5,
  },
  knobMicContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  knobWrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  micSection: {
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  micEmoji: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  micEmojiActive: {
    borderColor: C.danger,
    backgroundColor: "rgba(255,59,48,0.15)",
  },
  micDetectedWrap: {
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
  },
  micDetectedHint: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    color: C.textTertiary,
    textAlign: "center",
  },
  pitchIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  pitchIndicatorText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 10,
    color: C.text,
    flexShrink: 1,
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
  playBtnText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 15,
    color: C.white,
  },
  tuningGuideToggle: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: -8,
    marginBottom: -8,
  },
  tuningGuideToggleText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 11,
    color: C.textTertiary,
  },
});
