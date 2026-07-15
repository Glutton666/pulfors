module.exports = {
  Asset: {
    fromModule: () => ({ uri: "stub://asset", downloadAsync: () => Promise.resolve() }),
    loadAsync: () => Promise.resolve(),
  },
};
