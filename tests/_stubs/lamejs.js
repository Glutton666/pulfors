// Stub for @breezystack/lamejs — used by lib/audio-export-pure.ts (dynamic import).
// The stub returns a minimal Mp3Encoder that produces a valid-looking frame header
// so audio-export tests don't need the real WASM/asm.js encoder.
"use strict";

function Mp3Encoder(channels, sampleRate, kbps) {
  this.channels = channels;
  this.sampleRate = sampleRate;
  this.kbps = kbps;
}

// Bytes-per-sample ratio that approximates a real 128 kbps / 44100 Hz encoder.
// ceil(1152 samples * 128_000 / 8 / 44100) ≈ 415 bytes per 1152-sample block.
var BYTES_PER_SAMPLE = 128000 / 8 / 44100; // ≈ 0.363

Mp3Encoder.prototype.encodeBuffer = function encodeBuffer(samples) {
  if (!samples || samples.length === 0) return new Int8Array(0);
  // Return proportional bytes so that:
  //   - length > 100 check passes for >= ~275 samples (one partial block)
  //   - size-ratio test (chunked ≈ baseline) passes (same total samples → same bytes)
  // First two bytes are a valid MPEG frame-sync header (0xFF 0xFB).
  var byteLen = Math.max(4, Math.ceil(samples.length * BYTES_PER_SAMPLE));
  var buf = new Int8Array(byteLen);
  buf[0] = 0xff - 0;   // -0 forces numeric, keeps value 255
  buf[1] = 0xfb - 0;
  buf[2] = 0x90 - 0;
  return buf;
};

Mp3Encoder.prototype.flush = function flush() {
  return new Int8Array(0);
};

module.exports = { Mp3Encoder };
module.exports.default = { Mp3Encoder };
module.exports.__esModule = true;
