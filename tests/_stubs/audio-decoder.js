/**
 * audio-decoder (local native module) stub for Jest.
 *
 * Simulates a successful native decode by returning destUri unchanged —
 * tests that need to inspect actual decoded PCM should stage the WAV bytes
 * at destUri via the expo-file-system stub's _mockState before calling code
 * under test, the same way other native-module-backed flows do.
 */

const _mockState = {
  /** override to simulate the native module throwing */
  shouldThrow: false,
  /** args of the last decodeToWav() call */
  lastCall: null,
  reset() {
    this.shouldThrow = false;
    this.lastCall = null;
  },
};

async function decodeToWav(sourceUri, destUri) {
  _mockState.lastCall = { sourceUri, destUri };
  if (_mockState.shouldThrow) {
    throw new Error("audio-decoder stub: simulated decode failure");
  }
  return destUri;
}

function isAudioDecoderAvailable() {
  return !_mockState.shouldThrow;
}

const stub = { decodeToWav, isAudioDecoderAvailable, _mockState };
stub.__esModule = true;
module.exports = stub;
module.exports.default = stub;
