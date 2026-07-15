module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      [
        "babel-preset-expo",
        {
          // unstable 옵션 제거 (Expo SDK 54에서는 불필요)
        },
      ],
    ],
    plugins: [
      // React Compiler (app.json에 experiments.reactCompiler: true가 있으면 자동 적용되지만, 명시적으로 제어하고 싶을 때)
      // "babel-plugin-react-compiler",   // 필요 시 주석 해제 (현재는 experiments로 충분)

      // Reanimated 플러그인 (마지막에 위치해야 함 - 매우 중요!)
      "react-native-reanimated/plugin",
    ],
  };
};
