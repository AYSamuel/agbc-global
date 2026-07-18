import tseslint from 'typescript-eslint';

// Shared base per docs/spec/24 §2.3: typescript-eslint STRICT, type-checked via the
// project service. Framework configs (eslint-config-expo, eslint-config-next) are added
// per app; eslint-config-prettier is appended LAST by each consumer.
export default [
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
  {
    // Plain JS config files (babel.config.js, *.mjs configs) are not part of the TS
    // project; type-aware rules would error on them.
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    ...tseslint.configs.disableTypeChecked,
  },
];
