// expo-audio stub for Node.js test environment.
//
// AudioModule 은 빈 객체로 선언한다.
// lib/android-audio-focus.ts 의 capability check 가
//   typeof audioModule.addInterruptionListener === "function"
// 을 false 로 평가해 expo-av 폴백으로 조용히 넘어가도록 의도된 것이다.
// addInterruptionListener 를 여기서 추가하면 expo-audio 네이티브 경로가
// 테스트 환경에서도 활성화되어 android-audio-focus 테스트 흐름이 바뀐다.
module.exports = {
  requestRecordingPermissionsAsync: async () => ({ status: "denied", canAskAgain: true }),
  setAudioModeAsync: async () => {},
  RecordingPresets: { HIGH_QUALITY: {} },
  AudioModule: {},
  createAudioPlayer: () => ({ play: () => {}, pause: () => {}, remove: () => {} }),
  useAudioPlayer: () => ({ play: () => {}, pause: () => {}, remove: () => {} }),
  useAudioRecorder: () => ({ prepareToRecordAsync: async () => {}, record: () => {}, stop: async () => {}, uri: null }),
};
