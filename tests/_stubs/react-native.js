module.exports = {
  Platform: { OS: "ios", select: (specifics) => specifics.ios ?? specifics.default },
  StyleSheet: { create: (s) => s, flatten: (s) => s },
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
};
