/**
 * StemSeparationModal — 음원 분리 (Stem Separation) UI
 *
 * 4가지 화면 단계:
 *  "landing"  — 가져온 음원 목록 + 새 음원 가져오기
 *  "options"  — 4스템 vs 6스템 선택 + 노이즈 제거 토글
 *  "progress" — 청크별 진행률 표시
 *  "mixer"    — 스템별 뮤트/솔로/볼륨 + 재생
 */
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useAudioPlayer } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { type TranslationFn } from "@/lib/i18n";
import { useScale } from "@/lib/scale";
import { FontSize, Radius, Spacing } from "@/constants/tokens";
import {
  type StemModel,
  type StemResult,
  type StemTrack,
  type SeparationProgress,
  type ModelDownloadProgress,
  getStemLabels,
  isOnnxRuntimeAvailable,
  loadStemResults,
  deleteStemResult,
  isModelAvailable,
  isDenoiserProvisioned,
  downloadModels,
  runStemSeparation,
} from "@/lib/stem-separation";

export interface StemSeparationModalProps {
  visible: boolean;
  onClose: () => void;
  onSetBpm?: (bpm: number) => void;
  /** Pre-load an audio file URI directly (e.g. from DrumKit pad selection) */
  initialUri?: string;
  /** Display name for the pre-loaded audio file */
  initialName?: string;
  /** Start the metronome in sync when playback begins */
  onStartMetronome?: () => void;
  /** Stop the metronome when stem playback stops */
  onStopMetronome?: () => void;
}

type Phase = "landing" | "options" | "downloading" | "progress" | "mixer";

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function stemLabelKey(name: string): "stemVocals" | "stemDrums" | "stemBass" | "stemOther" | "stemGuitar" | "stemPiano" {
  switch (name.toLowerCase()) {
    case "vocals": return "stemVocals";
    case "drums":  return "stemDrums";
    case "bass":   return "stemBass";
    case "guitar": return "stemGuitar";
    case "piano":  return "stemPiano";
    default:       return "stemOther";
  }
}

function stemIcon(name: string): React.ComponentProps<typeof Ionicons>["name"] {
  switch (name.toLowerCase()) {
    case "vocals": return "mic-outline";
    case "drums":  return "musical-notes-outline";
    case "bass":   return "radio-outline";
    case "guitar": return "guitar-outline" as any;
    case "piano":  return "piano-outline" as any;
    default:       return "layers-outline";
  }
}

function progressPhaseKey(p: SeparationProgress): "phaseDecoding" | "phaseDenoising" | "phaseSeparating" | "phaseAnalyzing" | "phaseDone" {
  switch (p.phase) {
    case "decoding":   return "phaseDecoding";
    case "denoising":  return "phaseDenoising";
    case "separating": return "phaseSeparating";
    case "analyzing":  return "phaseAnalyzing";
    case "done":       return "phaseDone";
  }
}

function progressPct(p: SeparationProgress): number {
  switch (p.phase) {
    case "decoding":   return p.pct;
    case "denoising":  return p.pct;
    case "separating": return p.pct;
    case "analyzing":  return p.pct;
    case "done":       return 100;
  }
}

export function StemSeparationModal({
  visible,
  onClose,
  onSetBpm,
  initialUri,
  initialName,
  onStartMetronome,
  onStopMetronome,
}: StemSeparationModalProps) {
  const { colors: C } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const S = useScale();

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const topPad = (insets.top || webTopInset) + Spacing.md;
  const botPad = (insets.bottom || webBottomInset) + Spacing.lg;

  const [phase, setPhase] = useState<Phase>("landing");
  const [results, setResults] = useState<StemResult[]>([]);

  const [pendingUri, setPendingUri] = useState<string>("");
  const [pendingName, setPendingName] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<StemModel>("htdemucs");
  const [noiseRemoval, setNoiseRemoval] = useState(false);

  const [progress, setProgress] = useState<SeparationProgress>({ phase: "decoding", pct: 0 });
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress>({ filename: "", overallPct: 0 });
  const abortRef = useRef<AbortController | null>(null);

  const [activeStem, setActiveStem] = useState<StemResult | null>(null);
  const [stemTracks, setStemTracks] = useState<StemTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  const onnxAvailable = isOnnxRuntimeAvailable();

  // Pre-create 6 players (max stems). useAudioPlayer hooks must be
  // called unconditionally at the top level — one slot per stem track.
  const player0 = useAudioPlayer(null);
  const player1 = useAudioPlayer(null);
  const player2 = useAudioPlayer(null);
  const player3 = useAudioPlayer(null);
  const player4 = useAudioPlayer(null);
  const player5 = useAudioPlayer(null);
  const stemPlayers: AudioPlayer[] = [player0, player1, player2, player3, player4, player5];

  // Sync play/pause state to all loaded players
  useEffect(() => {
    if (stemTracks.length === 0) return;
    stemTracks.forEach((_, idx) => {
      const p = stemPlayers[idx];
      if (!p) return;
      if (isPlaying) {
        try { p.seekTo(0); } catch {}
        p.play();
      } else {
        p.pause();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  /**
   * Centralized transport teardown — stops all stem players and notifies the
   * metronome host. Must be called on every mixer exit path (Back, Delete,
   * modal hide) to avoid invisible playback continuing after leaving the mixer.
   */
  const stopAllPlayback = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      stemPlayers.forEach((p) => { try { p.pause(); } catch {} });
      onStopMetronome?.();
    }
  // isPlaying is read inside the callback; intentional dep inclusion
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, onStopMetronome]);

  // Sync volume/muted to players whenever tracks change
  useEffect(() => {
    const hasSolo = stemTracks.some((s) => s.isSolo);
    stemTracks.forEach((stem, idx) => {
      const p = stemPlayers[idx];
      if (!p) return;
      const silent = stem.isMuted || (hasSolo && !stem.isSolo);
      p.volume = silent ? 0 : Math.max(0, Math.min(1, stem.volume));
      p.muted = silent;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stemTracks]);

  useEffect(() => {
    if (!visible) {
      // Ensure transport is fully torn down when modal is hidden
      stopAllPlayback();
      setPhase("landing");
      abortRef.current?.abort();
      setIsPlaying(false);
      stemPlayers.forEach((p) => { try { p.pause(); } catch {} });
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    loadStemResults().then(setResults).catch(() => {});
    // If an audio file was pre-loaded from an external source (e.g. DrumKit pad),
    // jump directly to options so the user doesn't have to re-import.
    if (initialUri) {
      setPendingUri(initialUri);
      setPendingName(initialName || initialUri.split("/").pop() || "audio");
      setPhase("options");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleImport = useCallback(async () => {
    try {
      // Stem separation decodes audio entirely on-device using a pure-JS WAV
      // parser — only WAV files are accepted. The MIME type filter below
      // restricts the system picker on most platforms; the extension check
      // below provides a second layer of defense.
      const res = await DocumentPicker.getDocumentAsync({
        type: ["audio/wav", "audio/x-wav", "audio/wave"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];

      // Second-layer guard: reject any non-WAV that slipped through
      const ext = (asset.name || "").split(".").pop()?.toLowerCase() ?? "";
      if (ext && ext !== "wav") {
        Alert.alert(
          t("stemSep", "formatErrorTitle"),
          t("stemSep", "formatErrorBody"),
        );
        return;
      }

      setPendingUri(asset.uri);
      setPendingName(asset.name || "audio");
      setPhase("options");
    } catch {
      Alert.alert(t("stemSep", "errorFileRead"));
    }
  }, [t]);

  const handleStartSeparation = useCallback(async () => {
    if (!pendingUri) return;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // ── Pre-flight: ensure the model is downloaded ──────────────────────────
    const modelAvailable = await isModelAvailable(selectedModel);
    if (!modelAvailable) {
      // Model is not cached AND no CDN URL is configured
      Alert.alert(t("stemSep", "errorModelNotFound"));
      return;
    }

    // Check if model is in cache already; if not, show download phase first
    const modelsDir = `${FileSystem.documentDirectory ?? ""}models/`;
    const modelFilename = selectedModel === "htdemucs_6s" ? "htdemucs_6s.ort" : "htdemucs.ort";
    const docPath = `${modelsDir}${modelFilename}`;
    let needsDownload = true;
    try {
      const info = await FileSystem.getInfoAsync(docPath);
      needsDownload = !(info.exists && ((info as { size?: number }).size ?? 0) > 1024);
    } catch {}

    if (needsDownload) {
      setDownloadProgress({ filename: modelFilename, overallPct: 0 });
      setPhase("downloading");
      const ok = await downloadModels(selectedModel, setDownloadProgress, ctrl.signal);
      if (ctrl.signal.aborted) { setPhase("options"); return; }
      if (!ok) {
        Alert.alert(t("stemSep", "errorModelNotFound"));
        setPhase("options");
        return;
      }
    }

    setPhase("progress");
    setProgress({ phase: "decoding", pct: 0 });

    const outcome = await runStemSeparation(
      pendingUri,
      pendingName,
      { model: selectedModel, noiseRemoval },
      (p) => { setProgress(p); },
      ctrl.signal,
    );

    if (ctrl.signal.aborted) {
      setPhase("options");
      return;
    }

    if (!outcome.ok) {
      let msg = t("stemSep", "errorInference");
      if (outcome.error === "unsupported_format") msg = t("stemSep", "errorUnsupportedFormat");
      else if (outcome.error === "memory_pressure")    msg = t("stemSep", "errorMemory");
      else if (outcome.error === "model_unavailable")  msg = t("stemSep", "nativeRequired");
      else if (outcome.error === "model_not_found")    msg = t("stemSep", "errorModelNotFound");
      Alert.alert(msg);
      setPhase("options");
      return;
    }

    const updated = await loadStemResults();
    setResults(updated);
    openMixer(outcome.result);
  }, [pendingUri, pendingName, selectedModel, noiseRemoval, t]);

  const handleCancelProgress = useCallback(() => {
    abortRef.current?.abort();
    setPhase("options");
  }, []);

  const openMixer = useCallback((result: StemResult) => {
    setActiveStem(result);
    const tracks = result.stems.map((s) => ({ ...s }));
    setStemTracks(tracks);
    setIsPlaying(false);
    // Load each stem file into its pre-created player slot
    tracks.forEach((stem, idx) => {
      const p = stemPlayers[idx];
      if (!p) return;
      try {
        p.replace({ uri: stem.uri });
        p.volume = Math.max(0, Math.min(1, stem.volume));
        p.muted = stem.isMuted;
      } catch {}
    });
    setPhase("mixer");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteResult = useCallback((id: string) => {
    Alert.alert(
      t("stemSep", "deleteResult"),
      t("stemSep", "deleteConfirm"),
      [
        { text: t("stemSep", "cancel"), style: "cancel" },
        {
          text: t("stemSep", "deleteBtn"),
          style: "destructive",
          onPress: async () => {
            // Stop transport before removing the active result
            stopAllPlayback();
            await deleteStemResult(id);
            const updated = await loadStemResults();
            setResults(updated);
            if (activeStem?.id === id) {
              setActiveStem(null);
              setPhase("landing");
            }
          },
        },
      ],
    );
  }, [activeStem, t, stopAllPlayback]);

  const handleMuteToggle = useCallback((idx: number) => {
    setStemTracks((prev) => {
      const next = prev.map((s, i) => i === idx ? { ...s, isMuted: !s.isMuted } : s);
      return next;
    });
  }, []);

  const handleSoloToggle = useCallback((idx: number) => {
    setStemTracks((prev) => {
      const hasSolo = prev.some((s, i) => s.isSolo && i !== idx);
      if (prev[idx].isSolo) {
        return prev.map((s) => ({ ...s, isSolo: false }));
      }
      return prev.map((s, i) => ({ ...s, isSolo: i === idx, isMuted: hasSolo ? s.isMuted : false }));
    });
  }, []);

  const handleVolumeChange = useCallback((idx: number, vol: number) => {
    setStemTracks((prev) => prev.map((s, i) => i === idx ? { ...s, volume: vol } : s));
  }, []);

  const handleClose = useCallback(() => {
    // Always tear down transport first so metronome stays in sync
    stopAllPlayback();
    abortRef.current?.abort();
    setIsPlaying(false);
    stemPlayers.forEach((p) => { try { p.pause(); } catch {} });
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, stopAllPlayback]);

  const styles = makeStyles(C, S.ms);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.overlay]}>
        <View style={[styles.sheet, { paddingTop: topPad, paddingBottom: botPad }]}>

          {phase === "landing" && (
            <LandingPhase
              results={results}
              onnxAvailable={onnxAvailable}
              onImport={handleImport}
              onOpenMixer={openMixer}
              onDelete={handleDeleteResult}
              onClose={handleClose}
              t={t}
              C={C}
              S={S}
              styles={styles}
            />
          )}

          {phase === "options" && (
            <OptionsPhase
              sourceName={pendingName}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              noiseRemoval={noiseRemoval}
              setNoiseRemoval={setNoiseRemoval}
              onStart={handleStartSeparation}
              onBack={() => setPhase("landing")}
              t={t}
              C={C}
              S={S}
              styles={styles}
            />
          )}

          {phase === "downloading" && (
            <DownloadingPhase
              downloadProgress={downloadProgress}
              onCancel={() => { abortRef.current?.abort(); setPhase("options"); }}
              t={t}
              C={C}
              S={S}
              styles={styles}
            />
          )}

          {phase === "progress" && (
            <ProgressPhase
              progress={progress}
              onCancel={handleCancelProgress}
              t={t}
              C={C}
              S={S}
              styles={styles}
            />
          )}

          {phase === "mixer" && activeStem && (
            <MixerPhase
              result={activeStem}
              tracks={stemTracks}
              isPlaying={isPlaying}
              onMute={handleMuteToggle}
              onSolo={handleSoloToggle}
              onVolumeChange={handleVolumeChange}
              onPlayToggle={() => {
                const nextPlaying = !isPlaying;
                setIsPlaying(nextPlaying);
                if (nextPlaying) {
                  // Sync: apply detected BPM to metronome + start it together with stems
                  if (activeStem.bpmMap.length > 0) onSetBpm?.(activeStem.bpmMap[0].bpm);
                  onStartMetronome?.();
                } else {
                  onStopMetronome?.();
                }
              }}
              onDelete={() => handleDeleteResult(activeStem.id)}
              onBack={() => {
                // Stop transport before leaving mixer so nothing plays invisibly
                stopAllPlayback();
                setPhase("landing");
              }}
              onClose={handleClose}
              onSetBpm={onSetBpm}
              t={t}
              C={C}
              S={S}
              styles={styles}
            />
          )}

        </View>
      </View>
    </Modal>
  );
}

interface PhaseProps {
  t: TranslationFn;
  C: ReturnType<typeof useTheme>["colors"];
  S: ReturnType<typeof useScale>;
  styles: ReturnType<typeof makeStyles>;
}

function LandingPhase({
  results,
  onnxAvailable,
  onImport,
  onOpenMixer,
  onDelete,
  onClose,
  t, C, S, styles,
}: PhaseProps & {
  results: StemResult[];
  onnxAvailable: boolean;
  onImport: () => void;
  onOpenMixer: (r: StemResult) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <View style={styles.header}>
        <MaterialCommunityIcons name="layers-triple-outline" size={S.ms(22, 0.4)} color={C.accent} />
        <Text style={[styles.title, { color: C.text }]}>{t("stemSep", "title")}</Text>
        <Pressable onPress={onClose} hitSlop={8} testID="stem-sep-close">
          <Ionicons name="close" size={S.ms(22, 0.4)} color={C.textSecondary} />
        </Pressable>
      </View>

      {!onnxAvailable && (
        <View style={[styles.noticeBox, { backgroundColor: C.accentDim, borderColor: C.accent }]}>
          <Ionicons name="information-circle-outline" size={S.ms(18, 0.4)} color={C.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.noticeTitle, { color: C.accent }]}>{t("stemSep", "nativeRequired")}</Text>
            <Text style={[styles.noticeBody, { color: C.textSecondary }]}>{t("stemSep", "nativeRequiredDesc")}</Text>
          </View>
        </View>
      )}

      <Pressable
        style={[styles.importBtn, { backgroundColor: C.accent, borderColor: C.accent }]}
        onPress={onImport}
        testID="stem-sep-import"
      >
        <Ionicons name="add-circle-outline" size={S.ms(20, 0.4)} color={C.background} />
        <Text style={[styles.importBtnText, { color: C.background }]}>{t("stemSep", "importSong")}</Text>
      </Pressable>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: Spacing.sm, paddingTop: Spacing.sm }}>
        {results.length === 0 && (
          <Text style={[styles.emptyText, { color: C.textSecondary }]}>{t("stemSep", "noResults")}</Text>
        )}
        {results.map((r) => (
          <Pressable
            key={r.id}
            style={[styles.resultCard, { backgroundColor: C.overlay08, borderColor: C.border }]}
            onPress={() => onOpenMixer(r)}
            testID={`stem-sep-result-${r.id}`}
          >
            <View style={styles.resultCardContent}>
              <MaterialCommunityIcons name="layers-triple" size={S.ms(20, 0.4)} color={C.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.resultName, { color: C.text }]} numberOfLines={1}>{r.sourceName}</Text>
                <Text style={[styles.resultMeta, { color: C.textSecondary }]}>
                  {getStemLabels(r.model).length}{" stems · "}{formatDate(r.createdAt)}
                </Text>
              </View>
              <Pressable
                onPress={() => onDelete(r.id)}
                hitSlop={8}
                style={{ padding: 4 }}
                testID={`stem-sep-delete-${r.id}`}
              >
                <Ionicons name="trash-outline" size={S.ms(16, 0.4)} color={C.textSecondary} />
              </Pressable>
              <Ionicons name="chevron-forward" size={S.ms(16, 0.4)} color={C.textSecondary} />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

function OptionsPhase({
  sourceName,
  selectedModel,
  setSelectedModel,
  noiseRemoval,
  setNoiseRemoval,
  onStart,
  onBack,
  t, C, S, styles,
}: PhaseProps & {
  sourceName: string;
  selectedModel: StemModel;
  setSelectedModel: (m: StemModel) => void;
  noiseRemoval: boolean;
  setNoiseRemoval: (v: boolean) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const [modelReady, setModelReady] = useState<boolean | null>(null);
  const [denoiserReady, setDenoiserReady] = useState<boolean>(false);

  useEffect(() => {
    setModelReady(null);
    isModelAvailable(selectedModel)
      .then(setModelReady)
      .catch(() => setModelReady(false));
  }, [selectedModel]);

  useEffect(() => {
    isDenoiserProvisioned()
      .then(setDenoiserReady)
      .catch(() => setDenoiserReady(false));
  }, []);

  // Auto-disable noise removal when denoiser is not provisioned
  useEffect(() => {
    if (!denoiserReady && noiseRemoval) setNoiseRemoval(false);
  }, [denoiserReady]);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8} testID="stem-sep-back">
          <Ionicons name="arrow-back" size={S.ms(22, 0.4)} color={C.textSecondary} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]} numberOfLines={1}>{t("stemSep", "optionsTitle")}</Text>
        <View style={{ width: S.ms(22, 0.4) }} />
      </View>

      <Text style={[styles.sourceLabel, { color: C.textSecondary }]} numberOfLines={1}>{sourceName}</Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: Spacing.md, paddingVertical: Spacing.md }}>
        <ModelOption
          model="htdemucs"
          selected={selectedModel === "htdemucs"}
          onSelect={() => setSelectedModel("htdemucs")}
          title={t("stemSep", "model4")}
          desc={t("stemSep", "model4Desc")}
          t={t} C={C} S={S} styles={styles}
        />
        <ModelOption
          model="htdemucs_6s"
          selected={selectedModel === "htdemucs_6s"}
          onSelect={() => setSelectedModel("htdemucs_6s")}
          title={t("stemSep", "model6")}
          desc={t("stemSep", "model6Desc")}
          t={t} C={C} S={S} styles={styles}
        />

        <Pressable
          style={[
            styles.toggleRow,
            {
              backgroundColor: !denoiserReady
                ? C.overlay08
                : noiseRemoval ? C.accentDim : C.overlay08,
              borderColor: !denoiserReady
                ? C.border
                : noiseRemoval ? C.accent : C.border,
              opacity: denoiserReady ? 1 : 0.5,
            },
          ]}
          onPress={denoiserReady ? () => setNoiseRemoval(!noiseRemoval) : undefined}
          testID="stem-sep-noise-removal"
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleTitle, { color: C.text }]}>{t("stemSep", "noiseRemoval")}</Text>
            <Text style={[styles.toggleDesc, { color: C.textSecondary }]}>{t("stemSep", "noiseRemovalDesc")}</Text>
            {!denoiserReady && (
              <Text style={[styles.toggleDesc, { color: C.textTertiary ?? C.textSecondary, marginTop: 2 }]}>
                {t("stemSep", "denoiserUnavailable")}
              </Text>
            )}
          </View>
          <View style={[
            styles.toggleKnob,
            { backgroundColor: denoiserReady && noiseRemoval ? C.accent : C.border },
          ]}>
            <Ionicons
              name={denoiserReady && noiseRemoval ? "checkmark" : "close"}
              size={S.ms(14, 0.4)}
              color={denoiserReady && noiseRemoval ? C.background : C.textSecondary}
            />
          </View>
        </Pressable>
      </ScrollView>

      {/* Preflight: warn (but don't block) when model not yet provisioned */}
      {modelReady === false && (
        <View style={[styles.warnBanner, { backgroundColor: C.overlay08, borderColor: C.accent }]}>
          <Ionicons name="warning-outline" size={S.ms(16, 0.4)} color={C.accent} style={{ marginRight: 6 }} />
          <Text style={[styles.toggleDesc, { color: C.textSecondary, flex: 1 }]}>
            {t("stemSep", "errorModelNotFound")}
          </Text>
        </View>
      )}

      <Pressable
        style={[
          styles.primaryBtn,
          {
            backgroundColor: modelReady === false ? C.overlay08 : C.accent,
            opacity: modelReady === null ? 0.6 : 1,
          },
        ]}
        onPress={modelReady !== false ? onStart : undefined}
        disabled={modelReady === false}
        testID="stem-sep-start"
      >
        <MaterialCommunityIcons
          name="layers-triple-outline"
          size={S.ms(20, 0.4)}
          color={modelReady === false ? C.textSecondary : C.background}
        />
        <Text style={[
          styles.primaryBtnText,
          { color: modelReady === false ? C.textSecondary : C.background },
        ]}>
          {modelReady === false
            ? t("stemSep", "modelNotConfigured")
            : t("stemSep", "startBtn")}
        </Text>
      </Pressable>
    </>
  );
}

function ModelOption({
  selected, onSelect, title, desc, t, C, S, styles,
}: PhaseProps & {
  model: StemModel;
  selected: boolean;
  onSelect: () => void;
  title: string;
  desc: string;
}) {
  return (
    <Pressable
      style={[
        styles.modelCard,
        {
          backgroundColor: selected ? C.accentDim : C.overlay08,
          borderColor: selected ? C.accent : C.border,
        },
      ]}
      onPress={onSelect}
    >
      <View style={[styles.modelRadio, { borderColor: selected ? C.accent : C.border }]}>
        {selected && <View style={[styles.modelRadioInner, { backgroundColor: C.accent }]} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.modelTitle, { color: selected ? C.accent : C.text }]}>{title}</Text>
        <Text style={[styles.modelDesc, { color: C.textSecondary }]}>{desc}</Text>
      </View>
    </Pressable>
  );
}

function DownloadingPhase({
  downloadProgress,
  onCancel,
  t, C, S, styles,
}: PhaseProps & {
  downloadProgress: ModelDownloadProgress;
  onCancel: () => void;
}) {
  const pct = downloadProgress.overallPct;
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.xl }}>
      <MaterialCommunityIcons name="cloud-download-outline" size={S.ms(48, 0.3)} color={C.accent} />
      <Text style={[styles.title, { color: C.text, textAlign: "center" }]}>{t("stemSep", "downloadingTitle")}</Text>
      <Text style={[styles.phaseLabel, { color: C.textSecondary }]}>{t("stemSep", "downloadingHint")}</Text>
      {!!downloadProgress.filename && (
        <Text style={[styles.chunkLabel, { color: C.textTertiary }]}>{downloadProgress.filename}</Text>
      )}
      <View style={[styles.progressTrack, { backgroundColor: C.overlay08 }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: C.accent, width: `${pct}%` as any },
          ]}
        />
      </View>
      <Text style={[styles.pctLabel, { color: C.textSecondary }]}>{pct}%</Text>
      <Pressable
        style={[styles.cancelBtn, { borderColor: C.border }]}
        onPress={onCancel}
        testID="stem-sep-download-cancel"
      >
        <Text style={[styles.cancelBtnText, { color: C.textSecondary }]}>{t("stemSep", "cancel")}</Text>
      </Pressable>
    </View>
  );
}

function ProgressPhase({
  progress,
  onCancel,
  t, C, S, styles,
}: PhaseProps & {
  progress: SeparationProgress;
  onCancel: () => void;
}) {
  const pct = progressPct(progress);
  const phaseKey = progressPhaseKey(progress);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: Spacing.xl }}>
      <MaterialCommunityIcons name="layers-triple-outline" size={S.ms(48, 0.3)} color={C.accent} />
      <Text style={[styles.title, { color: C.text, textAlign: "center" }]}>{t("stemSep", "progressTitle")}</Text>
      <Text style={[styles.phaseLabel, { color: C.textSecondary }]}>{t("stemSep", phaseKey)}</Text>

      {progress.phase === "separating" && (
        <Text style={[styles.chunkLabel, { color: C.textTertiary }]}>
          {t("stemSep", "chunkProgress")
            .replace("{{chunk}}", String(progress.chunk + 1))
            .replace("{{total}}", String(progress.totalChunks))}
        </Text>
      )}

      <View style={[styles.progressTrack, { backgroundColor: C.overlay08 }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: C.accent, width: `${pct}%` as any },
          ]}
        />
      </View>
      <Text style={[styles.pctLabel, { color: C.textSecondary }]}>{pct}%</Text>

      <Pressable
        style={[styles.cancelBtn, { borderColor: C.border }]}
        onPress={onCancel}
        testID="stem-sep-cancel"
      >
        <Text style={[styles.cancelBtnText, { color: C.textSecondary }]}>{t("stemSep", "cancel")}</Text>
      </Pressable>
    </View>
  );
}

function MixerPhase({
  result,
  tracks,
  isPlaying,
  onMute,
  onSolo,
  onVolumeChange,
  onPlayToggle,
  onDelete,
  onBack,
  onClose,
  onSetBpm,
  t, C, S, styles,
}: PhaseProps & {
  result: StemResult;
  tracks: StemTrack[];
  isPlaying: boolean;
  onMute: (idx: number) => void;
  onSolo: (idx: number) => void;
  onVolumeChange: (idx: number, vol: number) => void;
  onPlayToggle: () => void;
  onDelete: () => void;
  onBack: () => void;
  onSetBpm?: (bpm: number) => void;
  onClose: () => void;
}) {
  const hasSolo = tracks.some((t) => t.isSolo);

  return (
    <>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8} testID="stem-mixer-back">
          <Ionicons name="arrow-back" size={S.ms(22, 0.4)} color={C.textSecondary} />
        </Pressable>
        <Text style={[styles.title, { color: C.text }]} numberOfLines={1}>{t("stemSep", "mixerTitle")}</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={S.ms(22, 0.4)} color={C.textSecondary} />
        </Pressable>
      </View>

      <Text style={[styles.sourceLabel, { color: C.textSecondary }]} numberOfLines={1}>{result.sourceName}</Text>
      <Text style={[styles.mixerHint, { color: C.textTertiary }]}>{t("stemSep", "mixerHint")}</Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: Spacing.sm, paddingVertical: Spacing.sm }}>
        {tracks.map((stem, idx) => {
          const isSilent = stem.isMuted || (hasSolo && !stem.isSolo);
          const labelKey = stemLabelKey(stem.name);
          const icon = stemIcon(stem.name);
          return (
            <View
              key={idx}
              style={[
                styles.stemRow,
                {
                  backgroundColor: isSilent ? C.overlay08 : C.surface,
                  borderColor: stem.isSolo ? C.accent : C.border,
                  opacity: isSilent ? 0.5 : 1,
                },
              ]}
              testID={`stem-row-${stem.name}`}
            >
              <View style={styles.stemRowTop}>
                <Ionicons name={icon} size={S.ms(18, 0.4)} color={stem.isSolo ? C.accent : C.textSecondary} />
                <Text style={[styles.stemName, { color: stem.isSolo ? C.accent : C.text }]}>
                  {t("stemSep", labelKey)}
                </Text>

                <View style={styles.stemActions}>
                  <Pressable
                    style={[
                      styles.stemActionBtn,
                      { backgroundColor: stem.isMuted ? C.danger + "33" : C.overlay08, borderColor: stem.isMuted ? C.danger : C.border },
                    ]}
                    onPress={() => onMute(idx)}
                    testID={`stem-mute-${stem.name}`}
                  >
                    <Text style={[styles.stemActionText, { color: stem.isMuted ? C.danger : C.textSecondary }]}>
                      {t("stemSep", "mute")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.stemActionBtn,
                      { backgroundColor: stem.isSolo ? C.accentDim : C.overlay08, borderColor: stem.isSolo ? C.accent : C.border },
                    ]}
                    onPress={() => onSolo(idx)}
                    testID={`stem-solo-${stem.name}`}
                  >
                    <Text style={[styles.stemActionText, { color: stem.isSolo ? C.accent : C.textSecondary }]}>
                      {t("stemSep", "solo")}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.sliderRow}>
                <Ionicons name="volume-low" size={S.ms(14, 0.3)} color={C.textTertiary} />
                <Pressable
                  style={styles.volBtn}
                  onPress={() => onVolumeChange(idx, Math.max(0, stem.volume - 0.1))}
                  hitSlop={4}
                >
                  <Ionicons name="remove" size={S.ms(14, 0.3)} color={C.textSecondary} />
                </Pressable>
                <View style={[styles.volTrack, { backgroundColor: C.overlay08 }]}>
                  <View
                    style={[
                      styles.volFill,
                      { backgroundColor: isSilent ? C.textTertiary : C.accent, width: `${Math.round(stem.volume * 100)}%` as any },
                    ]}
                  />
                </View>
                <Pressable
                  style={styles.volBtn}
                  onPress={() => onVolumeChange(idx, Math.min(1, stem.volume + 0.1))}
                  hitSlop={4}
                >
                  <Ionicons name="add" size={S.ms(14, 0.3)} color={C.textSecondary} />
                </Pressable>
                <Ionicons name="volume-high" size={S.ms(14, 0.3)} color={C.textTertiary} />
              </View>
            </View>
          );
        })}
      </ScrollView>

      {onSetBpm && result.bpmMap.length > 0 && (
        <Pressable
          style={[styles.syncBpmBtn, { backgroundColor: C.surface, borderColor: C.accent }]}
          onPress={() => onSetBpm(result.bpmMap[0].bpm)}
          testID="stem-mixer-sync-bpm"
        >
          <Ionicons name="sync-outline" size={S.ms(16, 0.3)} color={C.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.syncBpmText, { color: C.accent }]}>{t("stemSep", "syncBpm")}</Text>
            <Text style={[styles.syncBpmHint, { color: C.textSecondary }]}>
              {t("stemSep", "syncBpmHint").replace("{{bpm}}", String(result.bpmMap[0].bpm))}
            </Text>
          </View>
        </Pressable>
      )}

      <View style={styles.mixerFooter}>
        <Pressable
          style={[styles.playBtn, { backgroundColor: C.accent }]}
          onPress={onPlayToggle}
          testID="stem-mixer-play"
        >
          <Ionicons name={isPlaying ? "stop" : "play"} size={S.ms(20, 0.4)} color={C.background} />
          <Text style={[styles.playBtnText, { color: C.background }]}>
            {isPlaying ? t("stemSep", "stop") : t("stemSep", "playAll")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.deleteBtn, { borderColor: C.danger }]}
          onPress={onDelete}
          testID="stem-mixer-delete"
        >
          <Ionicons name="trash-outline" size={S.ms(18, 0.4)} color={C.danger} />
        </Pressable>
      </View>
    </>
  );
}

const makeStyles = (C: ReturnType<typeof useTheme>["colors"], ms: (base: number, factor?: number) => number) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    sheet: {
      flex: 1,
      backgroundColor: C.surface,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingHorizontal: Spacing.lg,
      marginTop: 60,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.md,
      marginBottom: Spacing.sm,
    },
    title: {
      flex: 1,
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.subtitle,
    },
    noticeBox: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: Spacing.sm,
      borderWidth: 1,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
    },
    noticeTitle: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.small,
    },
    noticeBody: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.caption,
      marginTop: 2,
    },
    importBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: Spacing.sm,
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
      marginBottom: Spacing.sm,
    },
    importBtnText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    emptyText: {
      textAlign: "center" as const,
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.body,
      paddingTop: Spacing.xl,
      lineHeight: 24,
    },
    resultCard: {
      borderWidth: 1,
      borderRadius: Radius.md,
      overflow: "hidden" as const,
    },
    resultCardContent: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.md,
      padding: Spacing.md,
    },
    resultName: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    resultMeta: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.caption,
      marginTop: 2,
    },
    sourceLabel: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
      marginBottom: Spacing.sm,
    },
    modelCard: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.md,
      borderWidth: 1,
      borderRadius: Radius.md,
      padding: Spacing.md,
    },
    modelRadio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    modelRadioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    modelTitle: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    modelDesc: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
      marginTop: 2,
    },
    toggleRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.md,
      borderWidth: 1,
      borderRadius: Radius.md,
      padding: Spacing.md,
    },
    toggleTitle: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    toggleDesc: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
      marginTop: 2,
    },
    toggleKnob: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    warnBanner: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      padding: Spacing.sm,
      borderRadius: Radius.sm,
      borderWidth: 1,
      marginTop: Spacing.sm,
      marginHorizontal: Spacing.md,
    },
    primaryBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: Spacing.sm,
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
      marginTop: Spacing.md,
    },
    primaryBtnText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    progressTrack: {
      width: "80%",
      height: 8,
      borderRadius: 4,
      overflow: "hidden" as const,
    },
    progressFill: {
      height: 8,
      borderRadius: 4,
    },
    phaseLabel: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
      textAlign: "center" as const,
    },
    chunkLabel: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
      textAlign: "center" as const,
    },
    pctLabel: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.subtitle,
    },
    cancelBtn: {
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.xl,
      borderRadius: Radius.md,
      borderWidth: 1,
    },
    cancelBtnText: {
      fontFamily: "SpaceGrotesk_500Medium",
      fontSize: FontSize.body,
    },
    mixerHint: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.caption,
      marginBottom: Spacing.xs,
    },
    stemRow: {
      borderWidth: 1,
      borderRadius: Radius.md,
      padding: Spacing.sm,
      gap: Spacing.xs,
    },
    stemRowTop: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.sm,
    },
    stemName: {
      flex: 1,
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    stemActions: {
      flexDirection: "row" as const,
      gap: Spacing.xs,
    },
    stemActionBtn: {
      borderWidth: 1,
      borderRadius: Radius.xs,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xxs,
    },
    stemActionText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.caption,
    },
    sliderRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.xs,
    },
    volBtn: {
      padding: Spacing.xxs,
    },
    volTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      overflow: "hidden" as const,
    },
    volFill: {
      height: 6,
      borderRadius: 3,
    },
    mixerFooter: {
      flexDirection: "row" as const,
      gap: Spacing.sm,
      paddingTop: Spacing.sm,
    },
    playBtn: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: Spacing.sm,
      paddingVertical: Spacing.md,
      borderRadius: Radius.md,
    },
    playBtnText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    deleteBtn: {
      borderWidth: 1,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    syncBpmBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.sm,
      borderWidth: 1,
      borderRadius: Radius.md,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.sm,
    },
    syncBpmText: {
      fontFamily: "SpaceGrotesk_600SemiBold",
      fontSize: FontSize.body,
    },
    syncBpmHint: {
      fontFamily: "SpaceGrotesk_400Regular",
      fontSize: FontSize.small,
      marginTop: 2,
    },
  });
