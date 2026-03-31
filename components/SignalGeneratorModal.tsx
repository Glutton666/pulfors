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
import { useAudioPlayer } from "expo-audio";
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
    if (riffTag !== "RIFF") return null;
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

function analyzeWavLocally(base64: string, sampleRate: number): { frequency: number | null; note: string | null } {
  const decoded = decodeWavBase64(base64, sampleRate);
  const WINDOW_SIZE = 8192;
  const MIC_GATE = 0.03;
  if (!decoded || decoded.samples.length <= WINDOW_SIZE) return { frequency: null, note: null };
  const readings: number[] = [];
  const step = Math.floor(WINDOW_SIZE / 2);
  for (let offset = 0; offset + WINDOW_SIZE <= decoded.samples.length; offset += step) {
    const win = decoded.samples.slice(offset, offset + WINDOW_SIZE);
    const freq = autoCorrelate(win, decoded.rate, MIC_GATE);
    if (freq > 20 && freq <= 20000) readings.push(freq);
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

function autoCorrelate(buffer: Float32Array, sampleRate: number, rmsThreshold: number = 0.08): number {
  const SIZE = buffer.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < rmsThreshold) return -1;
  let r1 = 0;
  let r2 = SIZE - 1;
  const thresh = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buffer[i]) < thresh) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buffer[SIZE - i]) < thresh) { r2 = SIZE - i; break; }
  }
  const buf = buffer.slice(r1, r2);
  if (buf.length < 2) return -1;
  const c = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    for (let j = 0; j < buf.length - i; j++) c[i] += buf[j] * buf[j + i];
  }
  let d = 0;
  while (d < buf.length - 1 && c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < buf.length; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  }
  if (maxpos < 0 || maxval < 0) return -1;
  const clarity = c[0] > 0 ? maxval / c[0] : 0;
  if (clarity < 0.5) return -1;
  let T0 = maxpos;
  const x1 = c[T0 - 1] ?? 0;
  const x2 = c[T0];
  const x3 = c[T0 + 1] ?? 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);
  return sampleRate / T0;
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

function freqToNoteOctave(freq: number): { name: string; octave: number } {
  const semitones = 12 * Math.log2(freq / 440);
  const rounded = Math.round(semitones);
  const noteIndex = ((rounded % 12) + 12 + 9) % 12;
  const octave = Math.floor((rounded + 9) / 12) + 4;
  return { name: NOTE_NAMES[noteIndex], octave: Math.max(0, Math.min(8, octave)) };
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
        const next = Math.max(0, Math.min(1, valRef.current + delta));
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
            <MaterialCommunityIcons name="music-note-outline" size={18} color={accentColor} />
            <Text style={[tgStyles.title, { color: accentColor }]}>{t("signalGenerator", "tuningGuide")}</Text>
            <Pressable onPress={handleClose} hitSlop={12} style={tgStyles.closeBtn}>
              <Ionicons name="close" size={18} color={C.textSecondary} />
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
                    size={16}
                    color={expandedCategory === cat.id ? accentColor : C.textSecondary}
                  />
                  <Text style={[tgStyles.categoryText, expandedCategory === cat.id && { color: accentColor }]}>
                    {cat.name[lang]}
                  </Text>
                  <Ionicons
                    name={expandedCategory === cat.id ? "chevron-up" : "chevron-forward"}
                    size={14}
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
                        size={12}
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
    paddingVertical: 7,
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
  micMethod?: "native" | "webview";
}

export function SignalGeneratorModal({ visible, onClose, onAndroidMicToggle, androidMicFrequency, androidMicNote, micMethod = "native" }: SignalGeneratorModalProps) {
  const { colors: C } = useTheme();
  const pickerStyles = make_pickerStyles(C);
  const tgStyles = make_tgStyles(C);
  const styles = make_styles(C);
  const { t, language: lang } = useLanguage();
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  const S = useScale();
  const dynamicKnobSize = Math.min(
    Math.max(120, S.minDim * 0.35),
    220
  );
  const dynamicCardWidth = isLandscape
    ? Math.min(winW * 0.85, 680)
    : Math.min(Math.max(300, S.screenWidth * 0.88), 400);
  const [frequency, setFrequency] = useState(440);
  const [waveType, setWaveType] = useState<WaveType>("sine");
  const [isPlaying, setIsPlaying] = useState(false);
  const [editingFreq, setEditingFreq] = useState(false);
  const [freqInput, setFreqInput] = useState("440");
  const [selectedNote, setSelectedNote] = useState("A");
  const [selectedOctave, setSelectedOctave] = useState(4);
  const [tuningGuideOpen, setTuningGuideOpen] = useState(false);

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
  const micDetectedFreqRef = useRef<number | null>(null);
  const micActiveRef = useRef(false);
  const micAudioCtxRef = useRef<any>(null);
  const micAnalyserRef = useRef<any>(null);
  const micSourceRef = useRef<any>(null);
  const micStreamRef = useRef<any>(null);
  const micRafRef = useRef<number | null>(null);
  const micRecordingRef = useRef<Audio.Recording | null>(null);
  const micMobileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeFailCountRef = useRef(0);
  const nativeFallenBackRef = useRef(false);
  const [micWebViewActive, setMicWebViewActive] = useState(false);

  const engineRef = useRef(new SignalGeneratorEngine());
  const isPlayingRef = useRef(false);
  const mobileLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toneUri = useMemo(() => {
    if (Platform.OS === "web") return null;
    return generateToneDataUri(frequency, waveType, VOLUME_LINEAR);
  }, [frequency, waveType]);

  const mobilePlayer = useAudioPlayer(toneUri ?? undefined);

  const hapticFeedback = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const stopPlayback = useCallback(() => {
    isPlayingRef.current = false;
    if (Platform.OS === "web") {
      engineRef.current.stopWeb();
    } else {
      if (mobileLoopRef.current) {
        clearTimeout(mobileLoopRef.current);
        mobileLoopRef.current = null;
      }
      try { mobilePlayer.pause(); } catch {}
    }
    setIsPlaying(false);
  }, [mobilePlayer]);

  const startPlayback = useCallback(() => {
    isPlayingRef.current = true;
    if (Platform.OS === "web") {
      engineRef.current.startWeb(frequency, waveType, VOLUME_LINEAR);
    } else {
      const playLoop = () => {
        if (!isPlayingRef.current) return;
        try {
          mobilePlayer.seekTo(0);
          mobilePlayer.play();
        } catch {}
        mobileLoopRef.current = setTimeout(playLoop, 950);
      };
      playLoop();
    }
    setIsPlaying(true);
  }, [frequency, waveType, mobilePlayer]);

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
  }, [frequency, waveType]);

  useEffect(() => {
    return () => {
      engineRef.current.stopWeb();
      if (mobileLoopRef.current) clearTimeout(mobileLoopRef.current);
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
    setMicDetectedFreq(null);
    setMicDetectedNote(null);
    setMicAnalyzed(false);
  }, [stopMobileMic, stopMicAndroid, micMethod]);

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

      const buf = new Float32Array(analyser.fftSize);
      const MIC_GATE = 0.03;
      const WINDOW_MS = 500;
      let readings: number[] = [];
      let windowStart = Date.now();

      const detect = () => {
        if (!micActiveRef.current) return;
        analyser.getFloatTimeDomainData(buf);
        const freq = autoCorrelate(buf, audioCtx.sampleRate, MIC_GATE);
        if (freq > 20 && freq <= MAX_FREQ) {
          readings.push(freq);
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
    if (micMethod !== "webview" && !nativeFallenBackRef.current) return;
    setMicAnalyzed(true);
    if (androidMicFrequency) {
      setMicDetectedFreq(androidMicFrequency);
      setMicDetectedNote(androidMicNote ?? null);
    } else {
      setMicDetectedFreq(null);
      setMicDetectedNote(null);
    }
  }, [micWebViewActive, androidMicFrequency, androidMicNote, micMethod]);

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
    if (Platform.OS === "android" && micMethod === "webview") {
      startMicAndroid();
      return;
    }
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
          extension: ".wav",
          outputFormat: 0,
          audioEncoder: 0,
          sampleRate: SAMPLE_RATE,
          numberOfChannels: 1,
          bitRate: 768000,
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
                const analysisResult = analyzeWavLocally(base64, SAMPLE_RATE);
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
  }, [startMicAndroid, micMethod, autoFallbackToWebView, showMicPermissionAlert]);

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
      micTargetFreqRef.current = frequency;
    }
    prevFreqForMicRef.current = frequency;
  }, [frequency, micListening]);

  const pitchComparison = useMemo(() => {
    if (!micListening || !micDetectedFreq || !micHasTargetRef.current) return null;
    const target = micTargetFreqRef.current;
    const centsDiff = Math.round(1200 * Math.log2(micDetectedFreq / target));
    const targetNote = frequencyToNote(target);
    const targetLabel = `${targetNote.name}${targetNote.octave}`;
    if (Math.abs(centsDiff) <= 5) return { status: "exact" as const, cents: centsDiff, targetLabel };
    if (centsDiff > 0) return { status: "high" as const, cents: centsDiff, targetLabel };
    return { status: "low" as const, cents: centsDiff, targetLabel };
  }, [micListening, micDetectedFreq]);

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
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border, width: dynamicCardWidth }, isLandscape && { flexDirection: "row" as const, padding: 16, gap: 12, alignItems: "flex-start" as const }]}>
          {isLandscape && (
            <Pressable onPress={handleClose} hitSlop={12} style={{ position: "absolute" as const, top: 8, right: 8, zIndex: 10 }}>
              <Ionicons name="close" size={22} color={C.textSecondary} />
            </Pressable>
          )}
          {!isLandscape && (
            <>
              <View style={styles.header}>
                <MaterialCommunityIcons name="waveform" size={20} color={C.accent} />
                <Text style={[styles.title, { color: C.accent }]}>{t("signalGenerator", "title")}</Text>
                <Pressable onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
                  <Ionicons name="close" size={20} color={C.textSecondary} />
                </Pressable>
              </View>
              <View style={[styles.divider, { backgroundColor: C.border }]} />
            </>
          )}

          <View style={[styles.knobWrap, isLandscape && { flex: 1, overflow: "hidden" as const }]}>
            {isLandscape && (
              <View style={[styles.header, { alignSelf: "stretch" as const, marginBottom: 8 }]}>
                <MaterialCommunityIcons name="waveform" size={16} color={C.accent} />
                <Text style={[styles.title, { color: C.accent, fontSize: 14 }]}>{t("signalGenerator", "title")}</Text>
              </View>
            )}
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
                isLandscape && { top: 24, right: 42, width: 24, height: 24, borderRadius: 12 },
              ]}
              hitSlop={8}
              testID="signal-mic-toggle"
              accessibilityLabel={t("signalGenerator", "tunerMic")}
            >
              <MaterialCommunityIcons
                name={micListening ? "microphone-off" : "microphone"}
                size={isLandscape ? 14 : 20}
                color={micListening ? C.danger : C.textSecondary}
              />
            </Pressable>
            {micListening && micDetectedFreq ? (
              <View style={[styles.micDetectedWrap, isLandscape && { marginTop: 4 }]}>
                <Text style={[styles.micDetectedHint, { color: C.accent }, isLandscape && { fontSize: 10 }]}>
                  {micDetectedNote} {micDetectedFreq} {t("signalGenerator", "hzUnit")}
                </Text>
                {pitchComparison ? (
                  <View style={[
                    styles.pitchIndicator,
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
                      size={12}
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
                  </View>
                ) : null}
              </View>
            ) : micListening ? (
              <Text style={[styles.micDetectedHint, isLandscape && { fontSize: 10 }]}>
                {micAnalyzed ? t("signalGenerator", "noSignal") : t("signalGenerator", "detecting")}
              </Text>
            ) : null}
            {isLandscape && (
              <Pressable
                onPress={() => {
                  hapticFeedback();
                  isPlaying ? stopPlayback() : startPlayback();
                }}
                style={({ pressed }) => [
                  styles.playBtn,
                  { backgroundColor: isPlaying ? C.danger : C.accent, marginTop: 6, alignSelf: "center" as const, width: "30%" as const, paddingVertical: 5, borderRadius: 8, justifyContent: "center" as const },
                  pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
                ]}
                testID="signal-toggle"
              >
                <Ionicons
                  name={isPlaying ? "stop" : "play"}
                  size={14}
                  color={isPlaying ? C.white : C.background}
                />
              </Pressable>
            )}
          </View>

          {isLandscape ? (
            <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "flex-end" as const, gap: 10, paddingBottom: 4, marginTop: 24 }}>
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

            <Pressable
              onPress={() => {
                hapticFeedback();
                setTuningGuideOpen(true);
              }}
              style={[styles.tuningGuideToggle]}
            >
              <MaterialCommunityIcons name="music-note-outline" size={14} color={C.textTertiary} />
              <Text style={styles.tuningGuideToggleText}>
                {t("signalGenerator", "tuningGuide")}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={C.textTertiary} />
            </Pressable>

            <TuningGuideModal
              visible={tuningGuideOpen}
              onClose={() => setTuningGuideOpen(false)}
              onSelectFreq={(freq) => {
                setFrequency(freq);
                setTuningGuideOpen(false);
              }}
              lang={lang}
              accentColor={C.accent}
              accentDim={C.accentDim}
            />

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
            <Text style={styles.pickerHzHint}>
              {noteToFreq(selectedNote, selectedOctave)} {t("signalGenerator", "hzUnit")}
            </Text>

            <View style={[styles.waveSection, { gap: 0 }]}>
              <View style={styles.waveRow}>
                {WAVE_CONFIGS.map((w) => {
                  const active = waveType === w.type;
                  return (
                    <Pressable
                      key={w.type}
                      onPress={() => { hapticFeedback(); setWaveType(w.type); }}
                      style={[styles.waveBtn, active && { backgroundColor: C.accentDim, borderColor: C.accent }, { paddingHorizontal: 8, paddingVertical: 6 }]}
                    >
                      <MaterialCommunityIcons
                        name={w.icon as any}
                        size={16}
                        color={active ? C.accent : C.textTertiary}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
            </View>
          ) : (
            <View style={{ alignItems: "center" as const, gap: 18, width: "100%" as const }}>
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
            <Text style={styles.pickerHzHint}>
              {noteToFreq(selectedNote, selectedOctave)} {t("signalGenerator", "hzUnit")}
            </Text>

            <Pressable
              onPress={() => {
                hapticFeedback();
                setTuningGuideOpen(true);
              }}
              style={[styles.tuningGuideToggle]}
            >
              <MaterialCommunityIcons name="music-note-outline" size={14} color={C.textTertiary} />
              <Text style={styles.tuningGuideToggleText}>
                {t("signalGenerator", "tuningGuide")}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={C.textTertiary} />
            </Pressable>

            <TuningGuideModal
              visible={tuningGuideOpen}
              onClose={() => setTuningGuideOpen(false)}
              onSelectFreq={(freq) => {
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
                        size={20}
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
                size={20}
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
    </Modal>
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
  knobWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  micEmoji: {
    position: "absolute",
    top: 0,
    right: -46,
    width: 36,
    height: 36,
    borderRadius: 18,
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
    marginTop: 2,
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
  },
  pitchIndicatorText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 10,
    color: C.text,
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
