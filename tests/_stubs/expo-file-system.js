const noop = () => {};
const asyncNoop = async () => {};

// ── _mockState — write tracking for tests (score-audio-prepare.test.ts 등) ─
// Tests can read _mockState.writeCount / writtenUris and call _mockState.reset()
// between assertions.  The same object is returned by all requires of this stub
// within one Jest worker, so writes from dynamic import("expo-file-system") are
// visible here.
const _mockState = {
  writeCount: 0,
  writtenUris: [],
  reset() {
    this.writeCount = 0;
    this.writtenUris = [];
  },
};

// New File-system API used by lib/score-audio.ts → _ensureNoteFile()
//   new File(Paths.cache, `score_note_${midi}.wav`)
//   file.write(new Uint8Array(wav))
//   file.uri  → string

const Paths = {
  cache: "file:///stub/cache/",
  document: "file:///stub/doc/",
};

class MockFile {
  constructor(directory, filename) {
    this.uri = (directory || "file:///stub/cache/") + filename;
  }
  /** Synchronous write — records the call in _mockState. */
  write(_data) {
    _mockState.writeCount++;
    _mockState.writtenUris.push(this.uri);
  }
}

const stub = {
  documentDirectory: "file:///stub/doc/",
  cacheDirectory: "file:///stub/cache/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  writeAsStringAsync: asyncNoop,
  readAsStringAsync: async () => "",
  getInfoAsync: async () => ({ exists: false }),
  makeDirectoryAsync: asyncNoop,
  deleteAsync: asyncNoop,
  readDirectoryAsync: async () => [],
  copyAsync: asyncNoop,
  moveAsync: asyncNoop,
  downloadAsync: async () => ({ uri: "stub://" }),
  // New File API
  File: MockFile,
  Paths,
  _mockState,
};
module.exports = stub;
module.exports.default = stub;
