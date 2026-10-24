const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'dist-analyze/*', '.expo/*', 'ios/*', 'android/*'] },
  { files: ['**/*.{ts,tsx}'], rules: { '@typescript-eslint/no-explicit-any': 'error' } },
]);
