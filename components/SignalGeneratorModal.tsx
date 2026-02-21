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
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAudioPlayer } from "expo-audio";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";
import {
  WaveType,
  SignalGeneratorEngine,
  generateToneDataUri,
} from "@/lib/signal-generator-engine";
import { autoCorrelate, frequencyToNote } from "@/lib/tuner-engine";

const WAVE_OPTIONS: { type: WaveType; label: string; icon: string }[] = [
  { type: "sine", label: "Sine", icon: "sine-wave" },
  { type: "square", label: "Square", icon: "square-wave" },
  { type: "triangle", label: "Triangle", icon: "triangle-wave" },
  { type: "sawtooth", label: "Saw", icon: "sawtooth-wave" },
];

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
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

const KNOB_SIZE = 165;
const KNOB_RADIUS = KNOB_SIZE / 2;
const KNOB_STROKE = 5;
const ARC_START = 135;
const ARC_END = 405;
const ARC_RANGE = ARC_END - ARC_START;
const INDICATOR_RADIUS = KNOB_RADIUS - 14;

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
}

function Knob({ value, onChange, displayValue, displayUnit, accentColor, accentDim, onTapCenter }: KnobProps) {
  const knobRef = useRef<View>(null);
  const valRef = useRef(value);
  const movedRef = useRef(false);
  valRef.current = value;

  const haptic = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        movedRef.current = false;
        haptic();
      },
      onPanResponderMove: (_, gs) => {
        if (Math.abs(gs.dy) > 3) movedRef.current = true;
        const sensitivity = 0.0015;
        const delta = -gs.dy * sensitivity;
        const next = Math.max(0, Math.min(1, valRef.current + delta));
        if (Math.abs(next - valRef.current) > 0.001) {
          onChange(next);
        }
      },
      onPanResponderRelease: () => {
        if (!movedRef.current && onTapCenter) {
          onTapCenter();
        }
      },
    }), [onChange, haptic, onTapCenter]);

  const angle = ARC_START + value * ARC_RANGE;
  const indicator = polarToXY(angle, INDICATOR_RADIUS, KNOB_RADIUS, KNOB_RADIUS);

  return (
    <View style={styles.knobContainer}>
      <View
        ref={knobRef}
        {...panResponder.panHandlers}
        style={styles.knobOuter}
      >
        <View style={[styles.knobBg, { borderColor: accentDim }]}>
          <View style={[styles.knobIndicatorDot, { backgroundColor: accentColor, left: indicator.x - 6, top: indicator.y - 6 }]} />
        </View>
        <View style={styles.knobCenter} pointerEvents="none">
          <Text style={[styles.knobValue, { color: accentColor }]}>{displayValue}</Text>
          <Text style={styles.knobUnit}>{displayUnit}</Text>
        </View>
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
  const flatListRef = useRef<FlatList<T>>(null);
  const scrollingRef = useRef(false);
  const selectedIdx = data.indexOf(selected);

  useEffect(() => {
    if (!scrollingRef.current && selectedIdx >= 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({
          offset: selectedIdx * PICKER_ITEM_H,
          animated: true,
        });
      }, 50);
    }
  }, [selectedIdx]);

  const onMomentumEnd = useCallback(
    (e: any) => {
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

const pickerStyles = StyleSheet.create({
  column: {
    width: 90,
    overflow: "hidden",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
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
    color: Colors.textTertiary,
  },
});

interface SignalGeneratorModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SignalGeneratorModal({ visible, onClose }: SignalGeneratorModalProps) {
  const { colors: C } = useTheme();
  const [frequency, setFrequency] = useState(440);
  const [waveType, setWaveType] = useState<WaveType>("sine");
  const [isPlaying, setIsPlaying] = useState(false);
  const [editingFreq, setEditingFreq] = useState(false);
  const [freqInput, setFreqInput] = useState("440");
  const [selectedNote, setSelectedNote] = useState("A");
  const [selectedOctave, setSelectedOctave] = useState(4);

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
  const micActiveRef = useRef(false);
  const micAudioCtxRef = useRef<any>(null);
  const micAnalyserRef = useRef<any>(null);
  const micSourceRef = useRef<any>(null);
  const micStreamRef = useRef<any>(null);
  const micRafRef = useRef<number | null>(null);
  const micRecordingRef = useRef<Audio.Recording | null>(null);
  const micMobileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const decodeWavBase64 = useCallback((base64: string, sampleRate: number): { samples: Float32Array; rate: number } | null => {
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
  }, []);

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
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  }, []);

  const stopMic = useCallback(() => {
    micActiveRef.current = false;
    setMicListening(false);
    if (Platform.OS === "web") {
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
  }, [stopMobileMic]);

  const startMicWeb = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      micAudioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      micAnalyserRef.current = analyser;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      micSourceRef.current = source;

      micActiveRef.current = true;
      setMicListening(true);

      const buf = new Float32Array(analyser.fftSize);
      const MIC_GATE = 0.05;
      const detect = () => {
        if (!micActiveRef.current) return;
        analyser.getFloatTimeDomainData(buf);
        const freq = autoCorrelate(buf, audioCtx.sampleRate, MIC_GATE);
        if (freq > 20 && freq <= MAX_FREQ) {
          const rounded = Math.round(freq * 10) / 10;
          setMicDetectedFreq(rounded);
          const noteInfo = frequencyToNote(freq);
          setMicDetectedNote(`${noteInfo.name}${noteInfo.octave}`);
          setFrequency(rounded);
        } else {
          setMicDetectedFreq(null);
          setMicDetectedNote(null);
        }
        micRafRef.current = requestAnimationFrame(detect);
      };
      detect();
    } catch {
      setMicListening(false);
    }
  }, []);

  const startMicMobile = useCallback(async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      micActiveRef.current = true;
      setMicListening(true);

      const SAMPLE_RATE = 44100;
      const RECORD_MS = 200;
      const MIC_GATE = 0.05;

      const recordAndAnalyze = async () => {
        if (!micActiveRef.current) return;
        try {
          const recording = new Audio.Recording();
          await recording.prepareToRecordAsync({
            isMeteringEnabled: false,
            android: {
              extension: ".wav",
              outputFormat: (Audio as any).AndroidOutputFormat?.DEFAULT ?? 0,
              audioEncoder: (Audio as any).AndroidAudioEncoder?.DEFAULT ?? 0,
              sampleRate: SAMPLE_RATE,
              numberOfChannels: 1,
              bitRate: 128000,
            },
            ios: {
              extension: ".wav",
              outputFormat: (Audio as any).IOSOutputFormat?.LINEARPCM ?? 1819304813,
              audioQuality: (Audio as any).IOSAudioQuality?.HIGH ?? 127,
              sampleRate: SAMPLE_RATE,
              numberOfChannels: 1,
              bitRate: 128000,
              linearPCMBitDepth: 16,
              linearPCMIsBigEndian: false,
              linearPCMIsFloat: false,
            },
            web: { mimeType: "audio/wav", bitsPerSecond: 128000 },
          });
          micRecordingRef.current = recording;
          await recording.startAsync();

          micMobileTimerRef.current = setTimeout(async () => {
            if (!micActiveRef.current) return;
            try {
              await recording.stopAndUnloadAsync();
              const uri = recording.getURI();
              micRecordingRef.current = null;
              if (uri) {
                const base64 = await FileSystem.readAsStringAsync(uri, {
                  encoding: "base64" as any,
                });
                const decoded = decodeWavBase64(base64, SAMPLE_RATE);
                if (decoded && decoded.samples.length > 256) {
                  const freq = autoCorrelate(decoded.samples, decoded.rate, MIC_GATE);
                  if (freq > 20 && freq <= MAX_FREQ) {
                    const rounded = Math.round(freq * 10) / 10;
                    setMicDetectedFreq(rounded);
                    const noteInfo = frequencyToNote(freq);
                    setMicDetectedNote(`${noteInfo.name}${noteInfo.octave}`);
                    setFrequency(rounded);
                  } else {
                    setMicDetectedFreq(null);
                    setMicDetectedNote(null);
                  }
                }
                try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
              }
            } catch {}
            if (micActiveRef.current) {
              recordAndAnalyze();
            }
          }, RECORD_MS);
        } catch {
          if (micActiveRef.current) {
            micMobileTimerRef.current = setTimeout(recordAndAnalyze, 500);
          }
        }
      };

      recordAndAnalyze();
    } catch {
      setMicListening(false);
    }
  }, [decodeWavBase64]);

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
      startMic();
    }
  }, [micListening, stopMic, startMic, hapticFeedback]);

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

  const formatFreqDisplay = (f: number) => {
    if (f >= 1000) return (f / 1000).toFixed(f >= 10000 ? 1 : 2);
    return f >= 100 ? Math.round(f).toString() : f.toFixed(1);
  };

  const freqDisplayUnit = frequency >= 1000 ? "kHz" : "Hz";

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
        <View style={styles.card}>
          <View style={styles.header}>
            <MaterialCommunityIcons name="waveform" size={20} color={C.accent} />
            <Text style={[styles.title, { color: C.accent }]}>Signal Generator</Text>
            <Pressable onPress={handleClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.divider} />

          <View style={styles.knobWrap}>
            <Knob
              value={freqNorm}
              onChange={handleFreqKnob}
              displayValue={formatFreqDisplay(frequency)}
              displayUnit={freqDisplayUnit}
              accentColor={C.accent}
              accentDim={C.accentDim}
              onTapCenter={openFreqEdit}
            />
            <Pressable
              onPress={toggleMic}
              style={[
                styles.micEmoji,
                micListening && styles.micEmojiActive,
              ]}
              hitSlop={8}
              testID="signal-mic-toggle"
            >
              <MaterialCommunityIcons
                name={micListening ? "microphone-off" : "microphone"}
                size={20}
                color={micListening ? Colors.danger : Colors.textSecondary}
              />
            </Pressable>
            {micListening && micDetectedFreq ? (
              <Text style={[styles.micDetectedHint, { color: C.accent }]}>
                {micDetectedNote} {micDetectedFreq} Hz
              </Text>
            ) : micListening ? (
              <Text style={styles.micDetectedHint}>...</Text>
            ) : null}
          </View>

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
              <Text style={styles.freqEditUnit}>Hz</Text>
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
            {noteToFreq(selectedNote, selectedOctave)} Hz
          </Text>

          <View style={styles.waveSection}>
            <Text style={styles.sectionLabel}>WAVEFORM</Text>
            <View style={styles.waveRow}>
              {WAVE_OPTIONS.map((w) => {
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
                      color={active ? C.accent : Colors.textTertiary}
                    />
                    <Text style={[styles.waveBtnText, active && { color: C.accent }]}>{w.label}</Text>
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
              { backgroundColor: isPlaying ? Colors.danger : C.accent },
              pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
            ]}
            testID="signal-toggle"
          >
            <Ionicons
              name={isPlaying ? "stop" : "play"}
              size={20}
              color={isPlaying ? Colors.white : Colors.background}
            />
            <Text style={[styles.playBtnText, { color: isPlaying ? Colors.white : Colors.background }]}>
              {isPlaying ? "Stop" : "Play"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: 340,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
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
    flex: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    opacity: 0.5,
    width: "100%",
  },
  knobContainer: {
    alignItems: "center",
  },
  knobOuter: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
  },
  knobBg: {
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_RADIUS,
    borderWidth: KNOB_STROKE,
    backgroundColor: Colors.surfaceLight,
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
  },
  knobUnit: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: Colors.textTertiary,
    lineHeight: 18,
  },
  freqEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  freqEditInput: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 20,
    borderBottomWidth: 2,
    paddingVertical: 4,
    minWidth: 100,
    textAlign: "center",
  },
  freqEditUnit: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 16,
    color: Colors.textTertiary,
  },
  freqTapBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  freqTapText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
  },
  sectionLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
    color: Colors.textTertiary,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  notePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignSelf: "center",
  },
  pickerHzHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 10,
    color: Colors.textTertiary,
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
    borderColor: Colors.border,
  },
  waveBtnText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 9,
    color: Colors.textTertiary,
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
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  micEmojiActive: {
    borderColor: Colors.danger,
    backgroundColor: "rgba(255,59,48,0.15)",
  },
  micDetectedHint: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
    textAlign: "center",
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
  },
});
