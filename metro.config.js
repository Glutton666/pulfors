const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const existingBlockList = config.resolver.blockList || [];
const additionalBlockList = [
  /\.local\/.*/,
  // yarn/npm cache dirs don't need to be watched — excluding them prevents
  // ENOSPC (inotify file-watcher limit) from crashing Metro on this host.
  /\.cache\/.*/,
  /node_modules\/.cache\/.*/,
];

config.resolver.blockList = Array.isArray(existingBlockList)
  ? [...existingBlockList, ...additionalBlockList]
  : additionalBlockList;

module.exports = config;
