/**
 * onnxruntime-react-native stub for Jest.
 *
 * Simulates a 4-stem Demucs ONNX session (htdemucs).
 * Output shape: { stemName: Tensor { data: Float32Array, dims: [1, 2, N] } }
 */

const STEM_NAMES_4 = ["vocals", "drums", "bass", "other"];
const STEM_NAMES_6 = ["vocals", "drums", "bass", "other", "guitar", "piano"];

class MockTensor {
  constructor(type, data, dims) {
    this.type = type;
    this.data = data;
    this.dims = dims;
  }
}

const _mockState = {
  /** override to simulate ORT constructor throwing */
  shouldThrow: false,
  /** last options passed to create() */
  lastCreatePath: null,
  reset() {
    this.shouldThrow = false;
    this.lastCreatePath = null;
  },
};

function makeMockSession(stemNames) {
  return {
    inputNames: ["mixture"],
    outputNames: [...stemNames],
    run: async (feeds) => {
      const inputTensor = feeds["mixture"];
      const frames = inputTensor.dims[2];
      const out = {};
      for (const name of stemNames) {
        const data = new Float32Array(frames * 2);
        for (let i = 0; i < data.length; i++) data[i] = 0.01 * Math.sin(i * 0.1);
        out[name] = new MockTensor("float32", data, [1, 2, frames]);
      }
      return out;
    },
    release: async () => {},
  };
}

const InferenceSession = {
  create: async (pathOrData, options) => {
    if (_mockState.shouldThrow) {
      throw new Error("ORT stub: simulated model load failure");
    }
    _mockState.lastCreatePath = pathOrData;
    // Infer stem count from model path name
    const path = String(pathOrData);
    const is6stem = path.includes("6stems") || path.includes("6stem");
    return makeMockSession(is6stem ? STEM_NAMES_6 : STEM_NAMES_4);
  },
};

const stub = {
  InferenceSession,
  Tensor: MockTensor,
  _mockState,
};

module.exports = stub;
module.exports.default = stub;
