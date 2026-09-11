import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** Returns a duration suitable for motion-sensitive users. */
export function motionDuration(duration: number, reduceMotion: boolean): number {
  return reduceMotion ? 0 : Math.max(0, duration);
}

/**
 * Tracks the platform "Reduce Motion" setting.  AccessibilityInfo emits
 * changes while the app is running, so screens do not need to be remounted
 * when a user changes the setting in system preferences.
 */
export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {
        // Some web/native shims do not implement the query. Keep the
        // accessible default (animations enabled) in that case.
      });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => setReduceMotion(enabled),
    );
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  return reduceMotion;
}