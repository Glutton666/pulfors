const InterruptionModeAndroid = { DoNotMix: 1, DuckOthers: 2 };
const InterruptionModeIOS = { MixWithOthers: 0, DoNotMix: 1, DuckOthers: 2 };

class MockSound {
  constructor() {
    this._statusCallback = null;
    this._status = { isLoaded: true, isPlaying: true, shouldPlay: true };
  }
  setOnPlaybackStatusUpdate(cb) { this._statusCallback = cb; }
  async unloadAsync() { this._status = { isLoaded: false }; }
  _emit(patch) {
    Object.assign(this._status, patch);
    if (this._statusCallback) this._statusCallback({ ...this._status });
  }
}

MockSound.createAsync = async (source, initialStatus, cb) => {
  const sound = new MockSound();
  if (cb) sound.setOnPlaybackStatusUpdate(cb);
  sound._emit({ isPlaying: initialStatus?.shouldPlay ?? false });
  return { sound, status: { ...sound._status } };
};

module.exports = {
  Audio: {
    Sound: MockSound,
    setAudioModeAsync: async () => {},
  },
  InterruptionModeAndroid,
  InterruptionModeIOS,
};
