// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Apostrophes inside React Native <Text> are plain text, not HTML.
    rules: { "react/no-unescaped-entities": "off" },
  },
]);
