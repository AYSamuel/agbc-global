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
    // Keys-only rule (docs/spec/16): product surfaces never carry literal UI strings;
    // everything goes through i18n. The two dev-only screens (token demo, gallery)
    // are exempt until they are replaced at W1.1/W1.2.
    files: ['app/**/*.tsx', 'src/features/**/*.tsx'],
    ignores: ['app/dev-tokens.tsx', 'app/gallery.tsx'],
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
