import type { TranslationFn } from "./i18n.data";

export interface OnboardingTestSoundPlayer {
  seekTo: (seconds: number) => void;
  play: () => void;
}

export type RequestOnboardingPermission = (
  kind: "mic" | "location",
  t: TranslationFn,
  options: { showAlertOnDeny: boolean },
) => Promise<boolean>;

/**
 * Reuses the onboarding sample when possible and reports failures instead of
 * letting an unavailable audio device advance the visual "sound heard" state.
 */
export function playOnboardingTestSound<T extends OnboardingTestSoundPlayer>(
  currentPlayer: T | null,
  createPlayer: () => T,
): { ok: true; player: T } | { ok: false } {
  try {
    const player = currentPlayer ?? createPlayer();
    if (currentPlayer) player.seekTo(0);
    player.play();
    return { ok: true, player };
  } catch {
    return { ok: false };
  }
}

/** Requests onboarding permissions in a predictable order for the UI. */
export async function requestOnboardingPermissions(
  t: TranslationFn,
  requestPermission: RequestOnboardingPermission,
): Promise<{ micGranted: boolean; locationGranted: boolean }> {
  const micGranted = await requestPermission("mic", t, { showAlertOnDeny: false });
  const locationGranted = await requestPermission("location", t, { showAlertOnDeny: false });
  return { micGranted, locationGranted };
}