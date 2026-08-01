// __esModule: true prevents Babel's _interopRequireWildcard from copying this
// object at import time, allowing test-side mutations to DocumentPickerStub.*
// to propagate into already-loaded modules (same pattern as expo-file-system).
const stub = {
  getDocumentAsync: async () => ({ canceled: true, assets: null }),
};
stub.__esModule = true;
module.exports = stub;
