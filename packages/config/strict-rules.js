import tseslint from 'typescript-eslint';

// RULES-ONLY overlay of typescript-eslint strictTypeChecked, for apps whose framework
// config (eslint-config-expo, eslint-config-next) already registers the @typescript-eslint
// plugin. Registering the plugin twice from different package instances makes ESLint throw
// "Cannot redefine plugin", so this overlay carries only rule severities + the project
// service, and resolves rule names against the plugin the framework registered.
const ruleOverlays = tseslint.configs.strictTypeChecked
  .filter((c) => c.rules)
  .map((c) => ({ files: ['**/*.{ts,tsx}'], rules: c.rules }));

export default [
  ...ruleOverlays,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
];
