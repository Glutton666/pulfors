module.exports = {
  requestRecordingPermissionsAsync: async () => ({ status: "denied", canAskAgain: true }),
  setAudioModeAsync: async () => {},
  RecordingPresets: { HIGH_QUALITY: {} },
  AudioModule: {},
  createAudioPlayer: () => ({ play: () => {}, pause: () => {}, remove: () => {} }),
  useAudioPlayer: () => ({ play: () => {}, pause: () => {}, remove: () => {} }),
  useAudioRecorder: () => ({ prepareToRecordAsync: async () => {}, record: () => {}, stop: async () => {}, uri: null }),
};
