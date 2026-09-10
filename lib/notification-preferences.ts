let playbackNotificationsEnabled = false;
let playbackNotificationsRevision = 0;

export function arePlaybackNotificationsEnabled(): boolean {
  return playbackNotificationsEnabled;
}

export function setPlaybackNotificationsEnabled(enabled: boolean): void {
  if (playbackNotificationsEnabled !== enabled) playbackNotificationsRevision += 1;
  playbackNotificationsEnabled = enabled;
}

export function getPlaybackNotificationsRevision(): number {
  return playbackNotificationsRevision;
}