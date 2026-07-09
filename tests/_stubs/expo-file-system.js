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
  /** uri → Uint8Array: stores the raw bytes passed to file.write() so tests
   *  can decode the WAV content and inspect PCM samples. */
  writtenData: new Map(),
  reset() {
    this.writeCount = 0;
    this.writtenUris = [];
    this.writtenData = new Map();
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
  /** Synchronous write — records the call in _mockState and stores the raw
   *  bytes so tests can decode WAV content for PCM inspection. */
  write(data) {
    _mockState.writeCount++;
    _mockState.writtenUris.push(this.uri);
    _mockState.writtenData.set(
      this.uri,
      data instanceof Uint8Array ? data : new Uint8Array(data),
    );
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
// __esModule: true prevents Babel's _interopRequireWildcard from copying
// properties at import time. Without it, `import * as FileSystem from "..."` in
// lib/stem-separation.ts gets a frozen snapshot; later patches to this stub
// object are invisible to the module.
stub.__esModule = true;
module.exports = stub;
module.exports.default = stub;
