/** @type {import('jest').Config} */
module.exports = {
  modulePathIgnorePatterns: [
    "<rootDir>/.cache/",
    "<rootDir>/node_modules/.cache/",
  ],
  moduleNameMapper: {
    "^node:test$": "<rootDir>/tests/_stubs/node-test.js",
    "^node:assert/strict$": "<rootDir>/tests/_stubs/node-assert.js",
  },
  transform: {
    "^.+\\.[jt]sx?$": ["babel-jest", { presets: ["babel-preset-expo"] }],
  },
};
