import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { captureBreadcrumb } from "@/lib/error-tracking";
import { ensurePermission } from "@/lib/permissions";
import { computeLandscapeStats } from "@/app/index.helpers";
import { loadActivityLogs } from "@/lib/activity-log";
import type { ActivityLog } from "@/lib/activity-log";
import type { TranslationFn } from "@/lib/i18n";

interface UseLandscapePanelParams {
  isLandscape: boolean;
  isPlaying: boolean;
  t: TranslationFn;
}

export interface UseLandscapePanelResult {
  landscapeImageUri: string | null;
  setLandscapeImageUri: React.Dispatch<React.SetStateAction<string | null>>;
  landscapeImageModalVisible: boolean;
  setLandscapeImageModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  showLandscapeImage: boolean;
  setShowLandscapeImage: React.Dispatch<React.SetStateAction<boolean>>;
  landscapeContentType: "photo" | "stats";
  setLandscapeContentType: React.Dispatch<React.SetStateAction<"photo" | "stats">>;
  landscapeStatsLogs: ActivityLog[];
  landscapeStats: ReturnType<typeof computeLandscapeStats>;
  formatStatMinutes: (seconds: number) => string;
  pickLandscapeImage: () => Promise<void>;
  removeLandscapeImage: () => void;
}

/**
 * Manages the landscape-mode right-panel: photo picker, stats log loading,
 * and stat formatting. Extracted from useMetronomeScreen to keep it focused.
 */
export function useLandscapePanel({
  isLandscape,
  isPlaying,
  t,
}: UseLandscapePanelParams): UseLandscapePanelResult {
  const [landscapeImageUri, setLandscapeImageUri] = useState<string | null>(null);
  const [landscapeImageModalVisible, setLandscapeImageModalVisible] = useState(false);
  const [showLandscapeImage, setShowLandscapeImage] = useState(true);
  const [landscapeContentType, setLandscapeContentType] = useState<"photo" | "stats">("photo");
  const [landscapeStatsLogs, setLandscapeStatsLogs] = useState<ActivityLog[]>([]);

  // Stable ref so the permission-recovery pending-action closure always calls
  // the latest version of pickLandscapeImage without re-registering.
  const pickLandscapeImageRef = useRef<() => Promise<void>>(async () => {});

  const pickLandscapeImage = useCallback(async () => {
    try {
      const ok = await ensurePermission("photo", t, {
        pendingAction: () => { void pickLandscapeImageRef.current(); },
      });
      if (!ok) {
        setLandscapeImageModalVisible(false);
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setLandscapeImageUri(uri);
        AsyncStorage.setItem("metronome_landscape_image", uri);
      }
    } catch (e) {
      captureBreadcrumb({ category: "imagePicker", message: "pickLandscapeImage failed", level: "warning", data: { error: String(e) } });
    } finally {
      setLandscapeImageModalVisible(false);
    }
  }, [t]);

  useEffect(() => { pickLandscapeImageRef.current = pickLandscapeImage; }, [pickLandscapeImage]);

  const removeLandscapeImage = useCallback(() => {
    setLandscapeImageUri(null);
    AsyncStorage.removeItem("metronome_landscape_image");
    setLandscapeImageModalVisible(false);
  }, []);

  // Refresh stats logs while the stats panel is visible; poll every 30 s.
  useEffect(() => {
    if (!isLandscape || !showLandscapeImage || landscapeContentType !== "stats") return;
    let cancelled = false;
    const refresh = () => {
      loadActivityLogs().then((logs) => { if (!cancelled) setLandscapeStatsLogs(logs); });
    };
    refresh();
    const id = setInterval(refresh, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [isLandscape, showLandscapeImage, landscapeContentType, isPlaying]);

  const landscapeStats = useMemo(
    () => computeLandscapeStats(landscapeStatsLogs),
    [landscapeStatsLogs],
  );

  const formatStatMinutes = useCallback((seconds: number): string => {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
  }, []);

  return {
    landscapeImageUri,
    setLandscapeImageUri,
    landscapeImageModalVisible,
    setLandscapeImageModalVisible,
    showLandscapeImage,
    setShowLandscapeImage,
    landscapeContentType,
    setLandscapeContentType,
    landscapeStatsLogs,
    landscapeStats,
    formatStatMinutes,
    pickLandscapeImage,
    removeLandscapeImage,
  };
}
