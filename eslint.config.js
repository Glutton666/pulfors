const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "**/.cache/**",
      "**/.expo/**",
      "dist/**",
      "static-build/**",
      "playwright-report/**",
      "test-results/**",
      "attached_assets/**",
      "android/**/build/**",
      "ios/**/build/**",
      "tests/_stubs/**",
    ],
  }
]);
