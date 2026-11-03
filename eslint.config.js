// ESLint flat config — shared across the BuildTogether workspace.
// Non-type-checked recommended rules + Prettier compat. Per-package overrides add
// browser/node globals and JSX settings.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.vite/**',
      '**/out/**',
      '**/dist-electron/**',
      'release/**',
      '.claude/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.es2022,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // TypeScript already checks undefined identifiers; avoid double-reporting.
      'no-undef': 'off',
    },
  },
  // Desktop renderer: browser globals + JSX
  {
    files: ['apps/desktop/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  // Desktop Electron host (main + preload): node globals
  {
    files: ['apps/desktop/electron/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Backend package: node globals
  {
    files: ['apps/api/**/*.{ts,js}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Config + test files running in node
  {
    files: ['**/*.config.{ts,js}', 'e2e/**/*.{ts,js}', '**/*.{test,spec}.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
