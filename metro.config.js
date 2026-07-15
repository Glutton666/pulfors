const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const existingBlockList = config.resolver.blockList || [];
const additionalBlockList = [
  /\.local\/.*/,
];

config.resolver.blockList = Array.isArray(existingBlockList)
  ? [...existingBlockList, ...additionalBlockList]
  : additionalBlockList;

// Include ONNX/ORT model files as bundled assets for stem separation feature.
// The onnxruntime-react-native InferenceSession.create() expects a bundled
// asset URI; without this extension these files would be excluded from the
// Metro bundle and the model load would fail at runtime.
const existingAssetExts = config.resolver.assetExts ?? [];
config.resolver.assetExts = [...existingAssetExts, "ort", "onnx"];

module.exports = config;
