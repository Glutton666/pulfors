import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  TextInput,
  PanResponder,
  ScrollView,
  FlatList,
  useWindowDimensions,
} from "react-native";
import { AnimatedModal } from "@/components/AnimatedModal";
import { logger } from "@/lib/logger";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  AudioModule,
  createAudioPlayer,
  type AudioPlayer,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { safePlay } from "@/lib/audio-utils";
import { ensurePermission } from "@/lib/permissions";
import { captureBreadcrumb } from "@/lib/error-tracking";
import Colors from "@/constants/colors";
import { Radius, FontSize, Spacing } from "@/constants/tokens";
import { useTheme } from "@/contexts/ThemeContext";
import { useScale } from "@/lib/scale";
import type { ScaleValues } from "@/lib/scale";
import {
  WaveType,
  SignalGeneratorEngine,
  generateToneBase64,
} from "@/lib/signal-generator-engine";
import { TUNING_DATA } from "@/lib/tuning-data";
import {
  NOTE_NAMES,
  base64ToBytes,
  realFFT,
  frequencyToNote,
  fftPeakDetect,
  noteToFreq,
} from "@/lib/signal-analysis";
// react-native-audio-record는 네이티브 전용 — 웹이나 Expo Go에선 없을 수 있음
let AudioRecord: typeof import("react-native-audio-record").default | null = null;
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    AudioRecord = require("react-native-audio-record").default;
  } catch {
    // Expo Go 또는 네이티브 모듈 미설치 환경 — 마이크 분석 기능 비활성화
  }
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
        const sensitivity = 0.0004;
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
    borderRadius: Radius.md,
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

const _TG_LOG_MIN_HZ = 30;
const _TG_LOG_MAX_HZ = 1000;
const _TG_LOG_MIN = Math.log10(_TG_LOG_MIN_HZ);
const _TG_LOG_RANGE = Math.log10(_TG_LOG_MAX_HZ) - _TG_LOG_MIN;
function freqToBarPos(freq: number): number {
  return (Math.log10(Math.max(freq, _TG_LOG_MIN_HZ)) - _TG_LOG_MIN) / _TG_LOG_RANGE;
}
const CAT_COLORS: Record<string, string> = {
  guitar: "#FF7043",
  ukulele: "#26C6DA",
  orchestra: "#5C6BC0",
  western_other: "#66BB6A",
  asian_traditional: "#FFA726",
  percussion: "#AB47BC",
};
const RULER_TICKS: { hz: number; label: string }[] = [
  { hz: 30, label: "30" },
  { hz: 100, label: "100" },
  { hz: 300, label: "300" },
  { hz: 1000, label: "1k" },
];

interface TuningGuideModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectFreq: (freq: number) => void;
  lang: "ko" | "en";
  accentColor: string;
  accentDim: string;
}

export function TuningGuideModal({ visible, onClose, onSelectFreq, lang, accentColor, accentDim }: TuningGuideModalProps) {
  const { colors: C } = useTheme();
  const S = useScale();
  const tgStyles = make_tgStyles(C);
  const [tgNote, setTgNote] = useState("A");
  const [tgOctave, setTgOctave] = useState(4);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedInstrument, setExpandedInstrument] = useState<string | null>(null);
  const { t } = useLanguage();

  const handleClose = useCallback(() => {
    setExpandedCategory(null);
    setExpandedInstrument(null);
    onClose();
  }, [onClose]);

  const pickerFreq = noteToFreq(tgNote, tgOctave);

  return (
    <AnimatedModal visible={visible} transparent onRequestClose={handleClose} statusBarTranslucent>
      <View style={tgStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={tgStyles.card}>
          {/* Header */}
          <View style={tgStyles.header}>
            <MaterialCommunityIcons name="music-note-outline" size={S.ms(18, 0.4)} color={accentColor} />
            <Text style={[tgStyles.title, { color: accentColor }]}>{t("signalGenerator", "tuningGuide")}</Text>
            <Pressable onPress={handleClose} hitSlop={12} style={tgStyles.closeBtn}>
              <Ionicons name="close" size={S.ms(18, 0.4)} color={C.textSecondary} />
            </Pressable>
          </View>
          {/* Note / Octave picker */}
          <View style={tgStyles.noteSection}>
            <View style={tgStyles.notePickerRow}>
              <PickerColumn
                data={NOTE_NAMES}
                selected={tgNote}
                onSelect={setTgNote}
                accentColor={accentColor}
                accentDim={accentDim}
              />
              <PickerColumn
                data={OCTAVES}
                selected={tgOctave}
                onSelect={setTgOctave}
                accentColor={accentColor}
                accentDim={accentDim}
              />
            </View>
            <Pressable
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onSelectFreq(pickerFreq);
              }}
              style={[tgStyles.setTargetBtn, { backgroundColor: accentColor }]}
            >
              <Text style={tgStyles.setTargetBtnText}>{t("signalGenerator", "setTargetNote")}</Text>
              <Text style={tgStyles.setTargetFreq}>{pickerFreq} Hz</Text>
            </Pressable>
          </View>
          <View style={tgStyles.divider} />
          <Text style={tgStyles.hint}>{t("signalGenerator", "tapToSet")}</Text>
          {/* Accordion list */}
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
                  <View style={[tgStyles.catDot, { backgroundColor: CAT_COLORS[cat.id] ?? accentColor }]} />
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
                            hitSlop={8}
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
    </AnimatedModal>
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
    width: 338,
    maxHeight: "83%",
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
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
  noteSection: {
    marginTop: 12,
    alignItems: "center",
    gap: 10,
  },
  notePickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xxs,
    backgroundColor: C.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    alignSelf: "center",
  },
  setTargetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  setTargetBtnText: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  setTargetFreq: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
  },
  hint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: FontSize.caption,
    color: C.textTertiary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginTop: 8,
    marginBottom: 8,
  },
  scrollBody: {
    flexGrow: 0,
  },
  rulerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  rulerLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 9,
    color: C.textTertiary,
    textAlign: "center",
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 8,
    gap: 4,
  },
  legendLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 10,
    color: C.textSecondary,
    width: 66,
    lineHeight: 13,
  },
  legendFreq: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 9,
    color: C.textTertiary,
    width: 30,
    textAlign: "right",
    lineHeight: 11,
  },
  catDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
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
    borderRadius: Radius.sm,
  },
  instrumentText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.small,
    color: C.textSecondary,
    flex: 1,
  },
  stringList: {
    paddingLeft: 20,
    paddingBottom: Spacing.xs,
  },
  stringRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    gap: Spacing.sm,
  },
  stringNote: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 13,
    color: C.text,
    width: 36,
  },
  stringLabel: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: FontSize.small,
    color: C.textSecondary,
    flex: 1,
  },
  stringFreq: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: FontSize.caption,
    color: C.textTertiary,
  },
});

interface SignalGeneratorModalProps {
  visible: boolean;
  onClose: () => void;
  /**
   * 앱 레벨에서 TuningGuideModal을 렌더링하도록 위임. 두 모달이 동시에
   * 활성화되어 입력이 한쪽에 묶이는 'ghost' 상태를 막기 위해 SignalGenerator
   * 내부에서는 TuningGuideModal을 중첩 렌더링하지 않는다. 이 prop은 필수이며,
   * 누락 시 튜닝 가이드 트리거가 무동작이 되는 것을 막기 위해 타입 레벨에서
   * 강제한다.
   */
  onOpenTuningGuide: (currentFreq: number, onSelectFreq: (freq: number) => void) => void;
  /** 주변 BPM 감지 모달을 앱 레벨에서 열도록 위임한다. */
  onOpenBpmDetect: () => void;
}

export function SignalGeneratorModal({ visible, onClose, onOpenTuningGuide, onOpenBpmDetect }: SignalGeneratorModalProps) {
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
    : Math.min(Math.max(Math.min(100, winH * 0.22), Math.min(S.minDim, webMaxCard) * 0.42), S.isTablet ? 280 : 240);
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
  const preGuideFreqRef = useRef<number | null>(null);
  const [pickerLockFlash, setPickerLockFlash] = useState(false);

  const pickerDrivenRef = useRef(false);

  const handleNoteSelect = useCallback((note: string) => {
    setSelectedNote(note);
    pickerDrivenRef.current = true;
    const f = noteToFreq(note, selectedOctave);
    if (f >= MIN_FREQ && f <= MAX_FREQ) {
      setFrequency(f);
      setPitchTargetFreq(f);
    }
    setTimeout(() => { pickerDrivenRef.current = false; }, 150);
  }, [selectedOctave]);

  const handleOctaveSelect = useCallback((oct: number) => {
    setSelectedOctave(oct);
    pickerDrivenRef.current = true;
    const f = noteToFreq(selectedNote, oct);
    if (f >= MIN_FREQ && f <= MAX_FREQ) {
      setFrequency(f);
      setPitchTargetFreq(f);
    }
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
  const [pitchTargetFreq, setPitchTargetFreq] = useState<number | null>(null);
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
  const audioRecordSubRef = useRef<{ remove: () => void } | null>(null);
  const pcmBufferRef = useRef<number[]>([]);

  const engineRef = useRef(new SignalGeneratorEngine());
  const isPlayingRef = useRef(false);
  const nativeSoundRef = useRef<AudioPlayer | null>(null);
  const nativeRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hapticFeedback = useCallback(() => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const stopNativeSound = useCallback(async () => {
    if (nativeSoundRef.current) {
      try { nativeSoundRef.current.pause(); } catch {}
      try { nativeSoundRef.current.remove(); } catch {}
      nativeSoundRef.current = null;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    if (nativeRestartTimerRef.current) {
      clearTimeout(nativeRestartTimerRef.current);
      nativeRestartTimerRef.current = null;
    }
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
        const player = createAudioPlayer({ uri: fileUri });
        player.loop = true;
        player.volume = 1.0;
        safePlay(player, "signalGen.tone");
        nativeSoundRef.current = player;
      } catch (e) {
        logger.warn("[SignalGen] native playback error:", e);
      }
    }
    setIsPlaying(true);
  }, [frequency, waveType, stopNativeSound]);

  const startPlaybackRef = useRef(startPlayback);
  useEffect(() => { startPlaybackRef.current = startPlayback; }, [startPlayback]);

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
    if (!isPlayingRef.current || Platform.OS === "web") return;
    if (nativeRestartTimerRef.current) {
      clearTimeout(nativeRestartTimerRef.current);
      nativeRestartTimerRef.current = null;
    }
    nativeRestartTimerRef.current = setTimeout(() => {
      nativeRestartTimerRef.current = null;
      if (isPlayingRef.current) startPlaybackRef.current();
    }, 80);
    return () => {
      if (nativeRestartTimerRef.current) {
        clearTimeout(nativeRestartTimerRef.current);
        nativeRestartTimerRef.current = null;
      }
    };
  }, [frequency, waveType]);

  useEffect(() => {
    return () => {
      engineRef.current.stopWeb();
      stopNativeSound();
      micActiveRef.current = false;
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      if (micSourceRef.current) { try { micSourceRef.current.disconnect(); } catch {} micSourceRef.current = null; }
      if (micAudioCtxRef.current) { try { micAudioCtxRef.current.close(); } catch {} micAudioCtxRef.current = null; }
      if (micStreamRef.current) { micStreamRef.current.getTracks().forEach((t: any) => t.stop()); micStreamRef.current = null; }
      if (audioRecordSubRef.current) { audioRecordSubRef.current.remove(); audioRecordSubRef.current = null; }
      if (Platform.OS !== "web") { try { AudioRecord!.stop(); } catch {} }
    };
  }, []);


  const stopMic = useCallback(() => {
    micActiveRef.current = false;
    setMicListening(false);
    if (Platform.OS === "web") {
      if (micRafRef.current) { cancelAnimationFrame(micRafRef.current); micRafRef.current = null; }
      if (micSourceRef.current) { try { micSourceRef.current.disconnect(); } catch {} micSourceRef.current = null; }
      if (micAudioCtxRef.current) { try { micAudioCtxRef.current.close(); } catch {} micAudioCtxRef.current = null; }
      if (micStreamRef.current) { micStreamRef.current.getTracks().forEach((t: any) => t.stop()); micStreamRef.current = null; }
    } else {
      if (audioRecordSubRef.current) { audioRecordSubRef.current.remove(); audioRecordSubRef.current = null; }
      try { AudioRecord!.stop(); } catch {}
      pcmBufferRef.current = [];
    }
    setMicAnalyzed(false);
    spectrumDataRef.current = null;
    spectrumPeakBinRef.current = -1;
  }, []);

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
        logger.warn("[MicTuner] getUserMedia not available");
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

      // 연속 감지: 임팩트 전용이 아닌 RMS 게이트 기반 지속 분석
      // 임팩트 전용 모드는 지속음/약한 연주를 놓치는 문제가 있었음
      const MIC_GATE = 0.018;       // 낮은 임계값으로 조용한 악기도 감지
      const SILENCE_RESET_MS = 600; // 침묵 지속시 readings 초기화
      const UPDATE_MS = 250;        // UI 업데이트 주기
      const MAX_READINGS = 60;      // 최대 보관 readings 수 (메모리 제한)
      let readings: number[] = [];
      let windowStart = Date.now();
      let lastSignalTime = Date.now();
      let spectrumFrameCount = 0;
      let frameCount = 0;

      const detect = () => {
        if (!micActiveRef.current) return;
        analyser.getFloatTimeDomainData(timeBuf);
        let rms = 0;
        for (let i = 0; i < timeBuf.length; i++) rms += timeBuf[i] * timeBuf[i];
        rms = Math.sqrt(rms / timeBuf.length);
        const nowMs = Date.now();

        if (rms >= MIC_GATE) {
          // 신호가 있을 때마다 스펙트럼 분석 (연속 감지)
          lastSignalTime = nowMs;
          analyser.getFloatFrequencyData(fftBuf);

          // 스펙트럼 디스플레이용 데이터 캡처 (매 4프레임마다 UI 업데이트)
          frameCount++;
          if (frameCount % 4 === 0) {
            spectrumCopy.set(fftBuf);
            spectrumDataRef.current = spectrumCopy;
            spectrumFrameCount++;
            setSpectrumTick(spectrumFrameCount);
          }

          // HPS 기반 기음 탐지
          const result = fftPeakDetect(fftBuf, audioCtx.sampleRate, analyser.fftSize);
          if (result && result.freq > 20 && result.freq <= MAX_FREQ) {
            spectrumPeakBinRef.current = result.peakBin;
            readings.push(result.freq);
            // 최대 readings 수 초과시 오래된 것 제거
            if (readings.length > MAX_READINGS) readings.shift();
          }
        } else if (nowMs - lastSignalTime > SILENCE_RESET_MS) {
          // 침묵이 일정 시간 지속되면 readings 초기화
          readings = [];
          windowStart = nowMs;
        }

        // UPDATE_MS마다 readings에서 지배적 주파수 계산 후 UI 갱신
        if (nowMs - windowStart >= UPDATE_MS) {
          windowStart = nowMs;
          if (readings.length >= 3) {
            const dominant = pickDominantFreq(readings);
            setMicAnalyzed(true);
            if (dominant) {
              setMicDetectedFreq(Math.round(dominant * 10) / 10);
              const noteInfo = frequencyToNote(dominant);
              setMicDetectedNote(`${noteInfo.name}${noteInfo.octave}`);
            }
            // readings의 후반부만 유지해 연속 음 변화에 대응
            readings = readings.slice(-Math.floor(MAX_READINGS / 2));
          } else if (nowMs - lastSignalTime > SILENCE_RESET_MS) {
            setMicDetectedFreq(null);
            setMicDetectedNote(null);
          }
        }

        micRafRef.current = requestAnimationFrame(detect);
      };
      detect();
    } catch (e) {
      logger.warn("[MicTuner] Web mic error:", e);
      setMicListening(false);
    }
  }, [pickDominantFreq]);

  const startNativeMic = useCallback(async () => {
    const ok = await ensurePermission("mic", t);
    if (!ok) return;
    try {
      AudioRecord!.init({
        sampleRate: 44100,
        channels: 1,
        bitsPerSample: 16,
        audioSource: 6, // VOICE_RECOGNITION — 마이크 직접 입력
      });

      const WINDOW_SIZE = 8192;
      const SR = 44100;
      pcmBufferRef.current = [];

      const sub = AudioRecord!.on("data", (data: string) => {
        if (!micActiveRef.current) return;
        const bytes = base64ToBytes(data);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const buf = pcmBufferRef.current;
        for (let i = 0; i + 1 < bytes.length; i += 2) {
          buf.push(view.getInt16(i, true) / 32768);
        }
        while (buf.length >= WINDOW_SIZE) {
          const win = new Float32Array(buf.splice(0, WINDOW_SIZE));
          let rms = 0;
          for (let i = 0; i < win.length; i++) rms += win[i] * win[i];
          rms = Math.sqrt(rms / win.length);
          if (rms < 0.01) { setMicAnalyzed(true); continue; }
          for (let i = 0; i < WINDOW_SIZE; i++) {
            win[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / (WINDOW_SIZE - 1)));
          }
          const mag = realFFT(win);
          const result = fftPeakDetect(mag, SR, WINDOW_SIZE);
          setMicAnalyzed(true);
          if (result && result.freq > 20 && result.freq <= 4200) {
            const freq = Math.round(result.freq * 10) / 10;
            setMicDetectedFreq(freq);
            const noteInfo = frequencyToNote(freq);
            setMicDetectedNote(`${noteInfo.name}${noteInfo.octave}`);
          } else {
            setMicDetectedFreq(null);
            setMicDetectedNote(null);
          }
        }
      });

      audioRecordSubRef.current = sub;
      micActiveRef.current = true;
      setMicListening(true);
      AudioRecord!.start();
    } catch (e) {
      logger.warn("[NativeMic] Error starting:", e);
      captureBreadcrumb({ category: "micTuner", message: "Native AudioRecord start error", level: "error" });
      if (audioRecordSubRef.current) { audioRecordSubRef.current.remove(); audioRecordSubRef.current = null; }
      try { AudioRecord!.stop(); } catch {}
      setMicListening(false);
      micActiveRef.current = false;
    }
  }, [t]);

  const startMic = useCallback(async () => {
    if (Platform.OS === "web") {
      startMicWeb();
    } else {
      startNativeMic();
    }
  }, [startMicWeb, startNativeMic]);

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

  const currentNote = useMemo(() => frequencyToNote(frequency), [frequency]);
  const currentNoteLabel = `${currentNote.name}${currentNote.octave}`;

  useEffect(() => { micDetectedFreqRef.current = micDetectedFreq; }, [micDetectedFreq]);

  const clearPitchTarget = useCallback(() => {
    hapticFeedback();
    setPitchTargetFreq(null);
  }, [hapticFeedback]);

  const pitchComparison = useMemo(() => {
    if (!micListening || !micDetectedFreq || pitchTargetFreq === null) return null;
    const centsDiff = Math.round(1200 * Math.log2(micDetectedFreq / pitchTargetFreq));
    const targetNote = frequencyToNote(pitchTargetFreq);
    const targetLabel = `${targetNote.name}${targetNote.octave}`;
    if (Math.abs(centsDiff) <= 5) return { status: "exact" as const, cents: centsDiff, targetLabel };
    if (centsDiff > 0) return { status: "high" as const, cents: centsDiff, targetLabel };
    return { status: "low" as const, cents: centsDiff, targetLabel };
  }, [micListening, micDetectedFreq, pitchTargetFreq]);

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

  const topPeaks = useMemo(() => {
    const data = spectrumDataRef.current;
    if (!data) return [];
    const sampleRate = micAudioCtxRef.current?.sampleRate ?? 48000;
    const fftSize = micAnalyserRef.current?.fftSize ?? 8192;
    const freqPerBin = sampleRate / fftSize;
    const MIN_DB = -65;
    const peaks: { hz: number; db: number; note: string }[] = [];
    for (let i = 2; i < data.length - 2; i++) {
      if (
        data[i] > MIN_DB &&
        data[i] >= data[i - 1] && data[i] >= data[i + 1] &&
        data[i] >= data[i - 2] && data[i] >= data[i + 2]
      ) {
        const hz = i * freqPerBin;
        if (hz >= 20 && hz <= 20000) {
          const info = frequencyToNote(hz);
          peaks.push({ hz: Math.round(hz), db: Math.round(data[i]), note: `${info.name}${info.octave}` });
        }
      }
    }
    peaks.sort((a, b) => b.db - a.db);
    return peaks.slice(0, 15);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spectrumTick]);

  return (
    <AnimatedModal
      visible={visible}
      transparent
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
          {/* LEFT column: controls (same as portrait) */}
          <ScrollView
            style={isLandscape ? { flex: 1 } : undefined}
            contentContainerStyle={!isLandscape ? { flexGrow: 1 } : undefined}
            showsVerticalScrollIndicator={false}
            bounces={false}
            nestedScrollEnabled
            testID="signal-scroll"
          >
          <View style={styles.knobMicContainer}>
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
                    setPitchTargetFreq(captured);
                  }
                } : undefined}
                noteLabel={currentNoteLabel}
                knobSize={dynamicKnobSize}
              />
            </View>
            {/* 마이크 버튼 — 노브 아래 독립 행 */}
            <View style={styles.micRow}>
              <Pressable
                onPress={toggleMic}
                style={[
                  styles.micEmoji,
                  micListening && styles.micEmojiActive,
                  { width: micBtnSize, height: micBtnSize, borderRadius: micBtnSize / 2 },
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
              {pitchTargetFreq !== null && (
                <View style={styles.targetChip}>
                  <MaterialCommunityIcons name="target" size={10} color={C.accent} />
                  <Text style={styles.targetChipText}>
                    {frequencyToNote(pitchTargetFreq).name}{frequencyToNote(pitchTargetFreq).octave}
                    {" "}{Math.round(pitchTargetFreq)} {t("signalGenerator", "hzUnit")}
                  </Text>
                  <Pressable onPress={clearPitchTarget} hitSlop={6}>
                    <Ionicons name="close-circle" size={12} color={C.textTertiary} />
                  </Pressable>
                </View>
              )}
            </View>
            {(micDetectedFreq || micListening) && (
            <View style={[styles.micSection, isLandscape && { gap: Spacing.xs }]}>
              {micDetectedFreq ? (
                <View style={[styles.micDetectedWrap, isLandscape && { marginTop: Spacing.xxs }]}>
                  <View style={{ flexDirection: "row" as const, alignItems: "center" as const, gap: Spacing.xs, flexWrap: "wrap" as const, justifyContent: "center" as const }}>
                    <Text style={[styles.micDetectedHint, { color: micListening ? C.accent : C.textTertiary }, isLandscape && { fontSize: FontSize.micro }]}>
                      {micDetectedFreq} {t("signalGenerator", "hzUnit")}
                    </Text>
                    <Text style={[styles.micDetectedHint, { color: micListening ? C.accent : C.textTertiary, opacity: 0.6 }, isLandscape && { fontSize: FontSize.micro }]}>|</Text>
                    <Text style={[styles.micDetectedHint, { color: micListening ? C.accent : C.textTertiary, fontWeight: "700" as const }, isLandscape && { fontSize: FontSize.micro }]}>
                      {micDetectedNote}
                    </Text>
                  </View>
                  {micListening && pitchComparison ? (
                    <View style={[
                      styles.pitchIndicator,
                      isLandscape && { paddingHorizontal: 6, paddingVertical: Spacing.xxs },
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
                    </View>
                  ) : null}
                </View>
              ) : micListening ? (
                <Text style={[styles.micDetectedHint, isLandscape && { fontSize: FontSize.micro }]}>
                  {micAnalyzed ? t("signalGenerator", "noSignal") : t("signalGenerator", "detecting")}
                </Text>
              ) : null}
            </View>
            )}
          </View>

          {!isLandscape && <View style={{ height: Math.max(14, S.ms(16, 0.4)) }} />}

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
                const capturedFreq = frequency;
                onOpenTuningGuide(capturedFreq, (selectedFreq) => {
                  if (preGuideFreqRef.current === null) preGuideFreqRef.current = capturedFreq;
                  setFrequency(selectedFreq);
                  setPitchTargetFreq(selectedFreq);
                });
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

            <Pressable
              onPress={() => { hapticFeedback(); onOpenBpmDetect(); }}
              style={[styles.tuningGuideToggle]}
            >
              <Ionicons name="mic-outline" size={S.ms(14, 0.4)} color={C.textTertiary} />
              <Text style={styles.tuningGuideToggleText}>
                {t("bpmDetect", "title")}
              </Text>
              <Ionicons name="chevron-forward" size={S.ms(14, 0.4)} color={C.textTertiary} />
            </Pressable>

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
                      testID={`signal-wave-${w.type}`}
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
          </ScrollView>

          {/* RIGHT column: detected Hz peaks (landscape only) */}
          {isLandscape && (
            <View style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: C.border, paddingLeft: landscapePadH, paddingTop: Spacing.xs }}>
              <Text style={{ color: C.textSecondary, fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 10, letterSpacing: 1.2, marginBottom: Spacing.sm, textTransform: "uppercase" as const }}>
                {t("signalGenerator", "detectedFreqs")}
              </Text>
              {micListening ? (
                topPeaks.length > 0 ? (
                  <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row" as const, paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: C.border, marginBottom: 2 }}>
                      <Text style={{ flex: 1.4, color: C.textTertiary, fontSize: 9, letterSpacing: 0.8, fontFamily: "SpaceGrotesk_500Medium" }}>Hz</Text>
                      <Text style={{ flex: 0.7, color: C.textTertiary, fontSize: 9, letterSpacing: 0.8, fontFamily: "SpaceGrotesk_500Medium", textAlign: "center" as const }}>{t("signalGenerator", "noteLabel")}</Text>
                      <Text style={{ flex: 1, color: C.textTertiary, fontSize: 9, letterSpacing: 0.8, fontFamily: "SpaceGrotesk_500Medium", textAlign: "right" as const }}>dBFS</Text>
                    </View>
                    {topPeaks.map((peak, i) => {
                      const isSelected = Math.abs(peak.hz - frequency) < 1;
                      return (
                      <Pressable
                        key={i}
                        onPress={() => {
                          setFrequency(peak.hz);
                          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setPickerLockFlash(true);
                          setTimeout(() => setPickerLockFlash(false), 200);
                        }}
                        style={[
                          { flexDirection: "row" as const, alignItems: "center" as const, paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.border + "30", borderRadius: 4 },
                          isSelected && { backgroundColor: C.accentDim },
                        ]}
                      >
                        <Text style={{ flex: 1.4, color: i === 0 ? C.accent : C.text, fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 12 }}>
                          {peak.hz}
                        </Text>
                        <Text style={{ flex: 0.7, color: i === 0 ? C.accent : C.textSecondary, fontSize: 11, textAlign: "center" as const, fontFamily: "SpaceGrotesk_500Medium" }}>
                          {peak.note}
                        </Text>
                        <Text style={{ flex: 1, color: C.textTertiary, fontSize: 11, textAlign: "right" as const, fontFamily: "SpaceGrotesk_400Regular" }}>
                          {peak.db}
                        </Text>
                      </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={{ color: C.textTertiary, fontSize: 12, fontFamily: "SpaceGrotesk_400Regular" }}>
                    {micAnalyzed ? t("signalGenerator", "noSignal") : t("signalGenerator", "detecting")}
                  </Text>
                )
              ) : (
                <View style={{ flex: 1, justifyContent: "center" as const, alignItems: "center" as const }}>
                  <MaterialCommunityIcons name="microphone-off" size={28} color={C.textTertiary} style={{ marginBottom: Spacing.sm }} />
                  <Text style={{ color: C.textTertiary, fontSize: 11, fontFamily: "SpaceGrotesk_400Regular", textAlign: "center" as const, lineHeight: 16 }}>
                    {t("signalGenerator", "micOffHint")}
                  </Text>
                </View>
              )}
            </View>
          )}
          </View>


        </View>
      </View>
    </AnimatedModal>
  );
}

const BUBBLE_COUNT = 3;
const LERP_GROW = 0.6;
const LERP_SHRINK = 0.03;
const HOLD_MS = 1800;
const AVG_WINDOW_MS = 200;

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

  interface PeakSample { freq: number; mag: number; isPrimary: boolean; time: number }
  const historyRef = useRef<PeakSample[]>([]);

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

    const now = performance.now();
    const topRaw = candidates.slice(0, BUBBLE_COUNT);
    for (const c of topRaw) {
      historyRef.current.push({ freq: c.bin * binRes, mag: c.mag, isPrimary: c.bin === peakBin, time: now });
    }

    const cutoff = now - AVG_WINDOW_MS;
    historyRef.current = historyRef.current.filter(s => s.time > cutoff);

    const groups: { freqs: number[]; mags: number[]; primaryCount: number }[] = [];
    for (const s of historyRef.current) {
      let found = false;
      for (const g of groups) {
        const gAvg = g.freqs.reduce((a, b) => a + b, 0) / g.freqs.length;
        if (Math.abs(s.freq - gAvg) / gAvg < 0.06) {
          g.freqs.push(s.freq);
          g.mags.push(s.mag);
          if (s.isPrimary) g.primaryCount++;
          found = true;
          break;
        }
      }
      if (!found) {
        groups.push({ freqs: [s.freq], mags: [s.mag], primaryCount: s.isPrimary ? 1 : 0 });
      }
    }

    groups.sort((a, b) => {
      const aMax = Math.max(...a.mags);
      const bMax = Math.max(...b.mags);
      return bMax - aMax;
    });

    const topGroups = groups.slice(0, BUBBLE_COUNT);
    const globalMax = topGroups.length > 0 ? Math.max(...topGroups[0].mags) : -100;

    const newTargets: BubbleState[] = [];
    for (const g of topGroups) {
      const avgFreq = g.freqs.reduce((a, b) => a + b, 0) / g.freqs.length;
      const avgMag = g.mags.reduce((a, b) => a + b, 0) / g.mags.length;
      const normalized = Math.max(0.1, Math.min(1, (avgMag - (-100)) / (globalMax - (-100) + 1)));
      newTargets.push({
        freq: avgFreq,
        size: normalized,
        isPrimary: g.primaryCount > g.freqs.length * 0.3,
      });
    }
    newTargets.sort((a, b) => b.size - a.size);
    while (newTargets.length < BUBBLE_COUNT) {
      newTargets.push({ freq: 0, size: 0, isPrimary: false });
    }

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
    historyRef.current = [];
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

  const anyVisible = display.some(b => b.freq > 0 || b.size > 0.01);

  const bubbles = useMemo(() => {
    const cw = containerSize.w;
    const ch = containerSize.h;
    const minDim = Math.min(cw, ch);
    const pad = 6;

    const active = display.filter(b => b.freq > 0 || b.size > 0.01);
    const count = active.length;
    const maxR = count <= 1 ? minDim * 0.32 : count === 2 ? minDim * 0.26 : minDim * 0.22;
    const minR = 6;

    const items: { cx: number; cy: number; r: number; freq: number; size: number; isPrimary: boolean }[] = [];

    for (let i = 0; i < BUBBLE_COUNT; i++) {
      const b = display[i];
      if (b.freq <= 0 && b.size <= 0.01) continue;

      const r = minR + b.size * (maxR - minR);

      let cx: number;
      let cy: number;
      if (count === 1) {
        cx = cw * 0.5;
        cy = ch * 0.48;
      } else if (count === 2) {
        const slot = items.length;
        cx = cw * (slot === 0 ? 0.33 : 0.67);
        cy = ch * 0.48;
      } else {
        const slot = items.length;
        cx = cw * (slot === 0 ? 0.5 : slot === 1 ? 0.2 : 0.8);
        cy = ch * (slot === 0 ? 0.38 : 0.6);
      }

      items.push({ cx, cy, r, freq: b.freq, size: b.size, isPrimary: b.isPrimary });
    }

    for (let iter = 0; iter < 10; iter++) {
      let anyOverlap = false;
      for (let a = 0; a < items.length; a++) {
        for (let b = a + 1; b < items.length; b++) {
          const ia = items[a];
          const ib = items[b];
          const dx = ib.cx - ia.cx;
          const dy = ib.cy - ia.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const needed = ia.r + ib.r + pad;
          if (dist < needed) {
            anyOverlap = true;
            const overlap = needed - dist;
            const nx = dist > 0.1 ? dx / dist : 1;
            const ny = dist > 0.1 ? dy / dist : 0;
            const half = overlap * 0.55;
            ia.cx -= nx * half;
            ia.cy -= ny * half;
            ib.cx += nx * half;
            ib.cy += ny * half;
          }
        }
      }
      for (const it of items) {
        it.cx = Math.max(it.r + 2, Math.min(cw - it.r - 2, it.cx));
        it.cy = Math.max(it.r + 2, Math.min(ch - it.r - 2, it.cy));
      }
      if (!anyOverlap) break;
    }

    return items;
  }, [display, containerSize]);

  const bgRings = useMemo(() => {
    const cw = containerSize.w;
    const ch = containerSize.h;
    const maxR = Math.min(cw, ch) * 0.42;
    return [
      { r: maxR * 0.33, cx: cw * 0.5, cy: ch * 0.5 },
      { r: maxR * 0.66, cx: cw * 0.5, cy: ch * 0.5 },
      { r: maxR * 1.0, cx: cw * 0.5, cy: ch * 0.5 },
    ];
  }, [containerSize]);

  return (
    <View
      ref={containerRef}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) setContainerSize({ w: width, h: height });
      }}
      style={{ flex: 1, backgroundColor: surfaceColor, borderRadius: 12, overflow: "hidden" as const }}
    >
      <View style={{ flex: 1, position: "relative" as const }}>
        {bgRings.map((ring, i) => (
          <View
            key={`ring-${i}`}
            style={{
              position: "absolute" as const,
              left: ring.cx - ring.r,
              top: ring.cy - ring.r,
              width: ring.r * 2,
              height: ring.r * 2,
              borderRadius: ring.r,
              borderWidth: 1,
              borderColor: `${accentColor}12`,
            }}
          />
        ))}
        {!anyVisible && (
          <>
            <View style={{
              position: "absolute" as const,
              left: containerSize.w * 0.5 - 3,
              top: 6,
              bottom: 6,
              width: 1,
              backgroundColor: `${accentColor}10`,
            }} />
            <View style={{
              position: "absolute" as const,
              top: containerSize.h * 0.5 - 3,
              left: 6,
              right: 6,
              height: 1,
              backgroundColor: `${accentColor}10`,
            }} />
            <View style={{ flex: 1, alignItems: "center" as const, justifyContent: "center" as const }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${accentColor}15`, alignItems: "center" as const, justifyContent: "center" as const, marginBottom: 6 }}>
                <Ionicons name="mic-outline" size={18} color={`${accentColor}50`} />
              </View>
              <Text style={{ fontSize: 9, color: textColor, fontFamily: "SpaceGrotesk_500Medium", opacity: 0.35 }}>
                {micActive ? "Listening..." : "Mic off"}
              </Text>
            </View>
          </>
        )}
        {bubbles.map((item, i) => {
          const diameter = item.r * 2;
          const opacity = Math.max(0.35, item.size);
          const isLarge = diameter > 36;

          return (
            <View
              key={i}
              style={{
                position: "absolute" as const,
                left: item.cx - item.r,
                top: item.cy - item.r,
                width: diameter,
                height: diameter,
                borderRadius: item.r,
                backgroundColor: item.isPrimary ? accentColor : `${accentColor}80`,
                opacity,
                alignItems: "center" as const,
                justifyContent: "center" as const,
                borderWidth: item.isPrimary ? 2 : 1,
                borderColor: item.isPrimary ? `${accentColor}` : `${accentColor}40`,
              }}
            >
              {isLarge ? (
                <View style={{ alignItems: "center" as const, paddingHorizontal: Spacing.xs }}>
                  <Text
                    style={{ fontSize: Math.min(12, diameter * 0.18), color: "#fff", fontFamily: "SpaceGrotesk_700Bold", textAlign: "center" as const }}
                    numberOfLines={1}
                  >
                    {formatFreq(item.freq)} Hz
                  </Text>
                  <Text
                    style={{ fontSize: Math.min(9, diameter * 0.13), color: "rgba(255,255,255,0.7)", fontFamily: "SpaceGrotesk_500Medium", marginTop: 1 }}
                    numberOfLines={1}
                  >
                    {noteNameFromFreq(item.freq)}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
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
    gap: Spacing.sm,
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
    fontSize: FontSize.caption,
    color: C.text,
    opacity: 0.7,
    marginTop: Spacing.xxs,
    lineHeight: 14,
  },
  freqEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Spacing.sm,
  },
  freqEditInput: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 20,
    color: C.text,
    borderBottomWidth: 2,
    paddingVertical: Spacing.xs,
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
    gap: Spacing.xxs,
    backgroundColor: C.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    alignSelf: "center",
  },
  pickerHzHint: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: FontSize.micro,
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
    paddingVertical: Spacing.sm,
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
    gap: Spacing.sm,
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
  micRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  targetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: C.accent + "60",
    backgroundColor: C.accentDim,
  },
  targetChipText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.micro,
    color: C.accent,
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
    gap: Spacing.xs,
    maxWidth: "100%",
  },
  micDetectedHint: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.caption,
    color: C.textTertiary,
    textAlign: "center",
  },
  pitchIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  pitchIndicatorText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.micro,
    color: C.text,
    flexShrink: 1,
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
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
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: -8,
    marginBottom: -8,
  },
  tuningGuideToggleText: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.caption,
    color: C.textTertiary,
  },
});
