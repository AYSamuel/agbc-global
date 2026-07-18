import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';
import agbcStrict from '@agbc/eslint-config/strict-rules';

// next's configs register @typescript-eslint; the strict layer is a rules-only overlay
// (see @agbc/eslint-config/strict-rules for why).
export default defineConfig([
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
  ...nextVitals,
  ...nextTs,
  ...agbcStrict,
  prettier,
]);
