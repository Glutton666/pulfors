import React from "react";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BarPlayButton } from "@/components/BarPlayButton";
import type { BarRepeat } from "@/components/beat-indicator.types";
import type { CustomSoundSetConfig } from "@/lib/storage";
import type { TranslationFn } from "@/lib/i18n";
import { FontSize, Spacing } from "@/constants/tokens";
import { formatBarDuration, SOUND_SET_OPTIONS, type BarModeColors } from "./BarModeTypes";

export interface BarPlaybackPanelProps {
  sourceBeat: number | null;
  repeat: BarRepeat | null;
  subdivisionCount: number;
  bpm: number;
  beatDenominator: 2 | 4 | 8;
  soundSet: string;
  layerSoundSets: Record<number, string>;
  customSoundSets: Record<string, CustomSoundSetConfig>;
  colors: BarModeColors;
  ms: (size: number, factor?: number) => number;
  t: TranslationFn;
  isPlaying: boolean;
  isPreparing: boolean;
  barLoopMode: "loop" | "once";
  onTogglePlay: () => void;
  onRandomPlayRequest?: () => void;
  onBarLoopModeChange: (mode: "loop" | "once") => void;
  blockPlayMode: "sequential" | "loop" | "random";
  onBlockPlayModeChange: (mode: "sequential" | "loop" | "random") => void;
}

export function BarPlaybackPanel({
  sourceBeat,
  repeat,
  subdivisionCount,
  bpm,
  beatDenominator,
  soundSet,
  layerSoundSets,
  customSoundSets,
  colors: C,
  ms,
  t,
  isPlaying,
  isPreparing,
  barLoopMode,
  onTogglePlay,
  onRandomPlayRequest,
  onBarLoopModeChange,
  blockPlayMode,
  onBlockPlayModeChange,
}: BarPlaybackPanelProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const effectiveBpm = repeat?.bpm && repeat.bpm > 0 ? repeat.bpm : bpm;
  const denominator = repeat?.meterDenominator ?? beatDenominator;

  const soundName = (key: string): string =>
    customSoundSets[key]?.name
      ?? (SOUND_SET_OPTIONS.find(option => option.key === key)
        ? t("barModeView", SOUND_SET_OPTIONS.find(option => option.key === key)!.labelKey)
        : key);

  const layers = repeat?.layers ?? [];
  const resolvedLayers = layers.map((layer, index) => ({
    index: index + 1,
    name: soundName(layer.soundSet ?? layerSoundSets[index + 1] ?? soundSet),
  }));

  return (
    <View
      testID="bar-playback-panel"
      style={[
        styles.panel,
        {
          backgroundColor: C.background,
          borderTopColor: C.overlay08,
          paddingBottom: Math.max(insets.bottom, Spacing.sm),
        },
        landscape && styles.landscapePanel,
      ]}
    >
      <View testID="bar-playback-source" style={styles.sourceRow}>
        <Text style={[styles.sourceText, { color: C.textTertiary }]}>
          {sourceBeat === null
            ? t("barModeView", "preparingPlayback")
            : t("barModeView", "playingBeat").replace("{{n}}", String(sourceBeat + 1))}
        </Text>
      </View>

      <View style={[styles.mainRow, landscape && styles.landscapeMainRow]}>
        <View testID="bar-playback-meter" style={styles.meterBlock}>
          <View style={styles.meter}>
            <Text style={[styles.meterValue, { color: C.accent }]}>{Math.max(1, subdivisionCount)}</Text>
            <Text style={[styles.meterSlash, { color: C.textTertiary }]}>/</Text>
            <Text style={[styles.meterValue, { color: C.accent }]}>{denominator}</Text>
          </View>
        </View>

        <View style={styles.playDock}>
          <BarPlayButton
            isPlaying={isPlaying}
            isPreparing={isPreparing}
            barLoopMode={barLoopMode}
            onTogglePlay={onTogglePlay}
            onRandomPlayRequest={onRandomPlayRequest}
            onBarLoopModeChange={onBarLoopModeChange}
            blockPlayMode={blockPlayMode}
            onBlockPlayModeChange={onBlockPlayModeChange}
            baseStyle={{ backgroundColor: C.backgroundSecondary, alignItems: "center", justifyContent: "center" }}
            sizeOverride={{ width: 76, height: 76, borderRadius: 38 }}
            accentColor={C.accent}
            dangerColor={C.danger}
            backgroundColor={C.background}
            iconSize={ms(34, 0.4)}
            badgeIconSize={ms(13, 0.4)}
            testID="bar-play-button"
            t={t}
          />
        </View>

        <View testID="bar-playback-bpm" style={styles.bpmBlock}>
          <Text style={[styles.metricLabel, { color: C.textTertiary }]}>BPM</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.bpmValue, { color: C.accent, fontSize: ms(28, 0.4) }]}>
            {Math.round(effectiveBpm)}
          </Text>
        </View>
      </View>

      <View style={[styles.details, landscape && styles.landscapeDetails]}>
        <View testID="bar-playback-repeat" style={[styles.repeatPill, { backgroundColor: C.overlay08 }]}>
          <Text style={[styles.detailLabel, { color: C.textTertiary }]}>
            {t("barModeView", repeat?.type === "duration" ? "repDuration" : "repCount")}
          </Text>
          <Text style={[styles.detailValue, { color: C.text }]}>
            {repeat?.type === "duration"
              ? formatBarDuration(repeat.value)
              : `×${repeat?.value ?? 1}`}
          </Text>
        </View>

        <ScrollView testID="bar-playback-sounds" style={styles.sounds} nestedScrollEnabled>
          <View style={[styles.soundLine, { borderBottomColor: C.overlay06 }]}>
            <Text style={[styles.soundRole, { color: C.textTertiary }]}>
              {t("barModeView", "mainLayer")}
            </Text>
            <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.soundName, { color: C.accent }]}>
              {soundName(soundSet)}
            </Text>
          </View>
          {resolvedLayers.map(layer => (
            <View key={layer.index} style={[styles.soundLine, { borderBottomColor: C.overlay06 }]}>
              <Text style={[styles.soundRole, { color: C.textTertiary }]}>
                {t("barModeView", "layerLabel")}{layer.index}
              </Text>
              <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.soundName, { color: C.textSecondary }]}>
                {layer.name}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: "100%",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  landscapePanel: {
    paddingTop: 2,
    gap: 2,
    paddingHorizontal: Spacing.lg,
  },
  sourceRow: {
    minHeight: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.micro,
  },
  mainRow: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
  },
  landscapeMainRow: {
    minHeight: 78,
  },
  meterBlock: {
    flex: 1,
    alignItems: "center",
  },
  metricLabel: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.micro,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  meter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  meterValue: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 30,
  },
  meterSlash: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 24,
  },
  playDock: {
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: Spacing.md,
  },
  bpmBlock: {
    flex: 1,
    alignItems: "center",
  },
  bpmValue: {
    fontFamily: "SpaceGrotesk_700Bold",
    minWidth: 52,
    textAlign: "center",
  },
  details: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  landscapeDetails: {
    alignItems: "center",
  },
  repeatPill: {
    minWidth: 78,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 8,
  },
  detailLabel: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.micro,
  },
  detailValue: {
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: FontSize.body,
    marginTop: 1,
  },
  sounds: {
    flex: 1,
    minWidth: 0,
    maxHeight: 78,
  },
  soundLine: {
    minHeight: 25,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  soundRole: {
    width: 66,
    flexShrink: 0,
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: FontSize.micro,
  },
  soundName: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: FontSize.caption,
  },
});
