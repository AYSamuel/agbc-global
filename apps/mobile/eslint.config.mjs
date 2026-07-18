import { defineConfig, globalIgnores } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import prettier from 'eslint-config-prettier/flat';
import agbcStrict from '@agbc/eslint-config/strict-rules';

// expo config registers @typescript-eslint; the strict layer is a rules-only overlay
// (see @agbc/eslint-config/strict-rules for why).
export default defineConfig([
  globalIgnores(['dist/*', '.expo/*']),
  expoConfig,
  ...agbcStrict,
  prettier,
]);
