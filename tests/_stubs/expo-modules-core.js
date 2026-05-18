module.exports = {
  EventEmitter: class EventEmitter {
    addListener() { return { remove: () => {} }; }
    removeAllListeners() {}
    emit() {}
  },
  NativeModulesProxy: {},
  requireNativeModule: () => ({}),
  requireOptionalNativeModule: () => null,
  Platform: { OS: "ios" },
};
