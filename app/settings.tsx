import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  TextInput,
  Alert,
  Switch,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn } from "react-native-reanimated";
import Colors from "@/constants/colors";
import { useMetronome } from "@/lib/metronome-context";
import { TempoPreset } from "@/lib/storage";

function SettingRow({ label, children, subtitle }: { label: string; children: React.ReactNode; subtitle?: string }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingLabel}>
        <Text style={styles.settingLabelText}>{label}</Text>
        {subtitle ? <Text style={styles.settingSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function VolumeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const barCount = 20;
  return (
    <View style={styles.volumeContainer}>
      <Feather name="volume" size={16} color={Colors.textTertiary} />
      <View style={styles.volumeBars}>
        {Array.from({ length: barCount }, (_, i) => {
          const filled = i / barCount < value;
          return (
            <Pressable
              key={i}
              onPress={() => onChange((i + 1) / barCount)}
              style={[styles.volumeBar, filled && styles.volumeBarFilled, { height: 12 + (i * 0.8) }]}
            />
          );
        })}
      </View>
      <Feather name="volume-2" size={16} color={Colors.textTertiary} />
      <Text style={styles.volumeValue}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

function RapidTapSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const options = [200, 300, 400, 500, 700, 1000];
  return (
    <View style={styles.chipRow}>
      {options.map((ms) => (
        <Pressable
          key={ms}
          onPress={() => onChange(ms)}
          style={[styles.chip, value === ms && styles.chipActive]}
        >
          <Text style={[styles.chipText, value === ms && styles.chipTextActive]}>
            {ms}ms
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function PresetEditor({ presets, onSave }: { presets: TempoPreset[]; onSave: (p: TempoPreset[]) => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editBpm, setEditBpm] = useState("");
  const [editMin, setEditMin] = useState("");
  const [editMax, setEditMax] = useState("");

  const startEdit = (idx: number) => {
    const p = presets[idx];
    setEditing(idx);
    setEditLabel(p.label);
    setEditBpm(String(p.bpm));
    setEditMin(String(p.min));
    setEditMax(String(p.max));
  };

  const saveEdit = () => {
    if (editing === null) return;
    const updated = [...presets];
    updated[editing] = {
      label: editLabel || "Custom",
      bpm: parseInt(editBpm) || 120,
      min: parseInt(editMin) || 20,
      max: parseInt(editMax) || 300,
    };
    onSave(updated);
    setEditing(null);
  };

  const addPreset = () => {
    const newPreset: TempoPreset = { label: "Custom", min: 100, max: 130, bpm: 115 };
    onSave([...presets, newPreset]);
  };

  const removePreset = (idx: number) => {
    if (presets.length <= 1) return;
    const updated = presets.filter((_, i) => i !== idx);
    onSave(updated);
  };

  return (
    <View style={styles.presetEditor}>
      {presets.map((p, idx) => (
        <View key={idx} style={styles.presetItem}>
          {editing === idx ? (
            <View style={styles.presetEditForm}>
              <TextInput
                style={styles.presetInput}
                value={editLabel}
                onChangeText={setEditLabel}
                placeholder="Label"
                placeholderTextColor={Colors.textTertiary}
              />
              <View style={styles.presetInputRow}>
                <TextInput
                  style={[styles.presetInput, styles.presetInputSmall]}
                  value={editMin}
                  onChangeText={setEditMin}
                  placeholder="Min"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="number-pad"
                />
                <Text style={styles.presetDash}>-</Text>
                <TextInput
                  style={[styles.presetInput, styles.presetInputSmall]}
                  value={editMax}
                  onChangeText={setEditMax}
                  placeholder="Max"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="number-pad"
                />
                <TextInput
                  style={[styles.presetInput, styles.presetInputSmall]}
                  value={editBpm}
                  onChangeText={setEditBpm}
                  placeholder="BPM"
                  placeholderTextColor={Colors.textTertiary}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.presetActions}>
                <Pressable onPress={saveEdit} style={styles.presetActionBtn}>
                  <Feather name="check" size={18} color={Colors.success} />
                </Pressable>
                <Pressable onPress={() => setEditing(null)} style={styles.presetActionBtn}>
                  <Feather name="x" size={18} color={Colors.danger} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.presetRow}>
              <View style={styles.presetInfo}>
                <Text style={styles.presetName}>{p.label}</Text>
                <Text style={styles.presetRange}>{p.min}-{p.max} BPM (default: {p.bpm})</Text>
              </View>
              <Pressable onPress={() => startEdit(idx)} style={styles.presetActionBtn}>
                <Feather name="edit-2" size={16} color={Colors.textSecondary} />
              </Pressable>
              <Pressable onPress={() => removePreset(idx)} style={styles.presetActionBtn}>
                <Feather name="trash-2" size={16} color={Colors.danger} />
              </Pressable>
            </View>
          )}
        </View>
      ))}
      <Pressable onPress={addPreset} style={styles.addPresetBtn}>
        <Feather name="plus" size={18} color={Colors.accent} />
        <Text style={styles.addPresetText}>Add Preset</Text>
      </Pressable>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, presets, updateSettings, updatePresets } = useMetronome();

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: (insets.top || webTopInset) + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <Feather name="arrow-left" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: (insets.bottom || webBottomInset) + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sound</Text>
          <View style={styles.card}>
            <SettingRow label="Volume">
              <VolumeSlider
                value={settings.volume}
                onChange={(v) => updateSettings({ volume: v })}
              />
            </SettingRow>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Controls</Text>
          <View style={styles.card}>
            <SettingRow
              label="Rapid Tap Window"
              subtitle="Tap +/- within this time for x10 adjustment"
            >
              <RapidTapSlider
                value={settings.rapidTapWindowMs}
                onChange={(v) => updateSettings({ rapidTapWindowMs: v })}
              />
            </SettingRow>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Playback</Text>
          <View style={styles.card}>
            <SettingRow label="Background Playback">
              <Switch
                value={settings.backgroundPlayback}
                onValueChange={(v) => updateSettings({ backgroundPlayback: v })}
                trackColor={{ false: Colors.surfaceLight, true: Colors.accent }}
                thumbColor={Colors.white}
              />
            </SettingRow>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.card}>
            <SettingRow label="Theme">
              <View style={styles.chipRow}>
                {(["analog", "digital"] as const).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => updateSettings({ theme: t })}
                    style={[styles.chip, settings.theme === t && styles.chipActive]}
                  >
                    <MaterialCommunityIcons
                      name={t === "analog" ? "metronome" : "waveform"}
                      size={16}
                      color={settings.theme === t ? Colors.accent : Colors.textTertiary}
                    />
                    <Text style={[styles.chipText, settings.theme === t && styles.chipTextActive]}>
                      {t === "analog" ? "Analog" : "Digital"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </SettingRow>

            <View style={styles.divider} />

            <SettingRow label="Beat Lights">
              <View style={styles.chipRow}>
                {([
                  { key: "all" as const, label: "All Beats", icon: "grid" as const },
                  { key: "accent" as const, label: "Accent Only", icon: "zap" as const },
                  { key: "none" as const, label: "Off", icon: "eye-off" as const },
                ]).map((opt) => (
                  <Pressable
                    key={opt.key}
                    onPress={() => updateSettings({ beatLightMode: opt.key })}
                    style={[styles.chip, settings.beatLightMode === opt.key && styles.chipActive]}
                  >
                    <Feather
                      name={opt.icon}
                      size={14}
                      color={settings.beatLightMode === opt.key ? Colors.accent : Colors.textTertiary}
                    />
                    <Text style={[styles.chipText, settings.beatLightMode === opt.key && styles.chipTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </SettingRow>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tempo Presets</Text>
          <View style={styles.card}>
            <PresetEditor presets={presets} onSave={updatePresets} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionTitle: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 13,
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  settingRow: {
    paddingVertical: 8,
    gap: 10,
  },
  settingLabel: {
    gap: 2,
  },
  settingLabelText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 15,
    color: Colors.text,
  },
  settingSubtitle: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 12,
    color: Colors.textTertiary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  volumeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  volumeBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    flex: 1,
  },
  volumeBar: {
    width: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceLight,
  },
  volumeBarFilled: {
    backgroundColor: Colors.accent,
  },
  volumeValue: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
    minWidth: 36,
    textAlign: "right",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chipActive: {
    backgroundColor: Colors.accentDim,
    borderColor: Colors.accent,
  },
  chipText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 12,
    color: Colors.textTertiary,
  },
  chipTextActive: {
    color: Colors.accent,
  },
  presetEditor: {
    gap: 8,
  },
  presetItem: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 10,
    marginBottom: 4,
  },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  presetInfo: {
    flex: 1,
    gap: 2,
  },
  presetName: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  presetRange: {
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 11,
    color: Colors.textTertiary,
  },
  presetActionBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  presetEditForm: {
    gap: 8,
  },
  presetInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    padding: 10,
    fontFamily: "SpaceGrotesk_400Regular",
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  presetInputSmall: {
    flex: 1,
  },
  presetDash: {
    color: Colors.textTertiary,
    fontSize: 16,
  },
  presetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 4,
  },
  addPresetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.accentMuted,
    borderStyle: "dashed",
    marginTop: 4,
  },
  addPresetText: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 13,
    color: Colors.accent,
  },
});
