const noop = () => {};
const asyncNoop = async () => {};
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
};
module.exports = stub;
module.exports.default = stub;
