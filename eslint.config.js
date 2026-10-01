import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Логические модули: чистый TypeScript без графики, DOM и недетерминированных источников.
const logicModules = [
  'src/core/**',
  'src/expr/**',
  'src/config/**',
  'src/validator/**',
  'src/telemetry/**',
];

export default defineConfig(
  {
    ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'android', 'art-pack'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**', 'tests/e2e/**'],
    languageOptions: { globals: globals.node },
  },
  {
    files: logicModules,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/render',
                '**/render/**',
                '**/ui',
                '**/ui/**',
                '**/editor',
                '**/editor/**',
                '**/platform',
                '**/platform/**',
              ],
              message: 'Логические модули не зависят от рендера, UI, редактора и платформы.',
            },
            {
              group: ['pixi.js', 'pixi.js/*', 'react', 'react-dom', 'react-dom/*', '@capacitor/*'],
              message: 'Логические модули не используют графику, React и Capacitor.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Используйте seeded RNG из core: партия должна быть детерминированной.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Время попадает в логику только через команду tick.',
        },
      ],
    },
  },
  prettier,
);
