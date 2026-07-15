// expo-audio stub for Node.js test environment.
//
// AudioModule 은 빈 객체로 선언한다.
// lib/android-audio-focus.ts 의 capability check 가
//   typeof audioModule.addInterruptionListener === "function"
// 을 false 로 평가해 expo-av 폴백으로 조용히 넘어가도록 의도된 것이다.
// addInterruptionListener 를 여기서 추가하면 expo-audio 네이티브 경로가
// 테스트 환경에서도 활성화되어 android-audio-focus 테스트 흐름이 바뀐다.
//
// 2026-05-09 조사(56.0.3 재확인): expo-audio 1.1.1 ~ 56.0.3(next 채널 포함) 모두
// NativeAudioModule 에 addInterruptionListener 를 노출하지 않는다.
// 해당 API 가 추가된 버전이 출시되면 tests/android-audio-focus.test.ts
// 섹션 B 상단의 "업그레이드 준비 체크리스트"를 따라 대응한다.
module.exports = {
  requestRecordingPermissionsAsync: async () => ({ status: "denied", canAskAgain: true }),
  setAudioModeAsync: async () => {},
  RecordingPresets: { HIGH_QUALITY: {} },
  AudioModule: {},
  createAudioPlayer: () => ({ play: () => {}, pause: () => {}, remove: () => {} }),
  useAudioPlayer: () => ({ play: () => {}, pause: () => {}, remove: () => {} }),
  useAudioRecorder: () => ({ prepareToRecordAsync: async () => {}, record: () => {}, stop: async () => {}, uri: null }),
};
