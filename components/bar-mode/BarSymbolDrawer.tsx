/**
 * BarSymbolDrawer — toggle row (time display + drawer open/close) and
 * the animated symbol palette that slides below it.
 */
import React from "react";
import { View, Text, Pressable, Animated, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FontSize, Spacing, Radius } from "@/constants/tokens";
import type { TranslationFn } from "@/lib/i18n";
import { SYMBOL_INFO, type BarModeColors, type SymbolType } from "./BarModeTypes";

interface BarSymbolDrawerProps {
  open: boolean;
  onToggle: () => void;
  placingSymbol: SymbolType | null;
  blockSelectFirst: number | null;
  selectedBarApplied: Set<SymbolType>;
  barStartBeat: number | null;
  isPlaying: boolean;
  totalDurationDisplay: string | null;
  barElapsedSec: number;
  beatsPerMeasure: number;
  onSymbolPress: (sym: SymbolType) => void;
  onRemoveSymbol: (sym: SymbolType, beat: number) => void;
  onCancelPlacing: () => void;
  colors: BarModeColors;
  ms: (size: number, factor?: number) => number;
  t: TranslationFn;
  drawerAnim: Animated.Value;
}

export function BarSymbolDrawer({
  open, onToggle, placingSymbol, blockSelectFirst, selectedBarApplied,
  barStartBeat, isPlaying, totalDurationDisplay, barElapsedSec, beatsPerMeasure,
  onSymbolPress, onRemoveSymbol, onCancelPlacing,
  colors: C, ms, t, drawerAnim,
}: BarSymbolDrawerProps) {
  const drawerHeight = drawerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 90] });

  return (
    <>
      {/* ── 토글 행 ── */}
      <View style={[styles.toggleRow, { borderBottomColor: C.overlay06, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        {/* 좌: 드로어 토글 */}
        <View style={{ flex: 1 }}>
          <Pressable
            onPress={() => {
              if (placingSymbol) { onCancelPlacing(); return; }
              onToggle();
            }}
            style={styles.toggleBtn}
            hitSlop={10}
          >
            {placingSymbol ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="close-circle" size={ms(14, 0.4)} color={SYMBOL_INFO[placingSymbol].color(C)} />
                <Text style={{ color: SYMBOL_INFO[placingSymbol].color(C), fontSize: FontSize.caption, fontFamily: "SpaceGrotesk_600SemiBold" }}>
                  {placingSymbol === "block" && blockSelectFirst !== null
                    ? t("barModeView", "blockSelectStarted").replace("{{n}}", String(blockSelectFirst + 1))
                    : `${t("barModeView", SYMBOL_INFO[placingSymbol].labelKey)} ${t("barModeView", "blockSelectPrompt")}`}
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons
                  name={open ? "chevron-up" : "chevron-down"}
                  size={ms(14, 0.4)}
                  color={C.textTertiary}
                />
                <Text style={{ color: C.textTertiary, fontSize: FontSize.micro, fontFamily: "SpaceGrotesk_500Medium" }}>
                  {open ? t("barModeView", "symbolDrawerClose") : t("barModeView", "symbolDrawerLabel")}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* 우: 총 시간 + 바 개수 */}
        <View style={{ alignItems: "flex-end", paddingRight: Spacing.md }}>
          {isPlaying ? (
            <>
              <Text style={{ color: C.accent, fontSize: ms(14, 0.4), fontFamily: "SpaceGrotesk_700Bold" }}>
                {(() => {
                  const em = Math.floor(barElapsedSec / 60);
                  const es = barElapsedSec % 60;
                  return `${em}:${String(es).padStart(2, "0")}`;
                })()}
                {totalDurationDisplay ? ` / ${totalDurationDisplay}` : ""}
              </Text>
              {beatsPerMeasure > 0 && (
                <Text style={{ color: C.textTertiary, fontSize: 9, fontFamily: "SpaceGrotesk_400Regular" }}>
                  {beatsPerMeasure}{t("barModeView", "barsDisplay")}
                </Text>
              )}
            </>
          ) : (
            <>
              {totalDurationDisplay && (
                <Text style={{ color: C.accent, fontSize: ms(14, 0.4), fontFamily: "SpaceGrotesk_700Bold" }}>
                  {totalDurationDisplay}
                </Text>
              )}
              {beatsPerMeasure > 0 && (
                <Text style={{ color: C.textTertiary, fontSize: 9, fontFamily: "SpaceGrotesk_400Regular" }}>
                  {beatsPerMeasure}{t("barModeView", "barsDisplay")}
                </Text>
              )}
            </>
          )}
        </View>
      </View>

      {/* ── 애니메이션 드로어 ── */}
      <Animated.View style={[styles.drawer, { height: drawerHeight, overflow: "hidden" }]}>
        <View style={[styles.drawerInner, { borderBottomColor: C.overlay08 }]}>
          {(Object.keys(SYMBOL_INFO) as SymbolType[]).map((sym) => {
            const info = SYMBOL_INFO[sym];
            const isPlacing = placingSymbol === sym;
            const isApplied = !placingSymbol && selectedBarApplied.has(sym);
            const col = info.color(C);
            const showActive = isPlacing || isApplied;
            return (
              <Pressable
                key={sym}
                onPress={() => {
                  if (isPlacing) {
                    onCancelPlacing();
                  } else if (isApplied && barStartBeat !== null) {
                    onRemoveSymbol(sym, barStartBeat);
                  } else {
                    onSymbolPress(sym);
                  }
                }}
                style={[
                  styles.symbolBtn,
                  {
                    backgroundColor: showActive ? col + "30" : C.backgroundSecondary,
                    borderColor: showActive ? col : "transparent",
                  },
                ]}
              >
                <View style={{ position: "relative" }}>
                  <Ionicons name={info.icon} size={ms(14, 0.4)} color={showActive ? col : C.textSecondary} />
                  {isApplied && (
                    <View style={{
                      position: "absolute", top: -4, right: -5,
                      width: 10, height: 10, borderRadius: 5,
                      backgroundColor: C.danger,
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <Text style={{ color: "#fff", fontSize: 7, fontFamily: "SpaceGrotesk_700Bold", lineHeight: 10 }}>×</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: showActive ? col : C.textTertiary, fontSize: 9, fontFamily: "SpaceGrotesk_500Medium", marginTop: 2 }}>
                  {t("barModeView", info.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleBtn: {
    paddingRight: 8,
  },
  drawer: {
    overflow: "hidden",
  },
  drawerInner: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  symbolBtn: {
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    borderWidth: 1,
    gap: 2,
  },
});
