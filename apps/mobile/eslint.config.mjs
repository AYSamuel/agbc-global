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
  {
    // Build-time Node scripts (e.g. the world-land generator), not app code. They
    // run under Node; declare the one Node global they use rather than pulling in
    // the `globals` package as a direct dependency just for this.
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { Buffer: 'readonly' } },
  },
  {
    // Keys-only rule (docs/spec/16): product surfaces never carry literal UI strings;
    // everything goes through i18n. The two dev-only screens (token demo, gallery)
    // are exempt until they are replaced at W1.1/W1.2.
    // `src/components/**` joined this list at W4.6: the rule had never covered the
    // shared UI library, so a literal string added to a primitive would have shipped
    // in English to every language while lint stayed green. The library was clean
    // when the gap was found, which is the cheapest moment to close it.
    files: ['app/**/*.tsx', 'src/features/**/*.tsx', 'src/components/**/*.tsx'],
    // Tests are excluded because a literal there is the FIXTURE, not copy.
    ignores: ['app/dev-tokens.tsx', 'app/gallery.tsx', '**/__tests__/**'],
    rules: {
      'react/jsx-no-literals': [
        'error',
        // Decorative brand glyphs, not translatable copy: the interpunct in meta
        // lines and the Glory star (mockup .glory .st, U+2726). Real UI strings
        // still must go through i18n.
        { noStrings: true, ignoreProps: true, allowedStrings: ['·', '✦'] },
      ],
    },
  },
  prettier,
]);
