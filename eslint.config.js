import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'dist/**',
      'dist-legacy/**',
      'node_modules/**',
      '**/.wrangler/**',
      '**/.audit-work/**',
      'verification-output/**',
      'test-results/**',
      'trellis/**',
      'public/**',
      'runtime/**',
      '**/.venv*/**',
    ],
  },
  js.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.es2021 } } },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['**/*.{ts,tsx}'] })),
  {
    files: ['**/*.{jsx,tsx}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  { rules: { 'no-control-regex': 'off', 'no-useless-escape': 'warn' } },
  {
    // Preserve v0.18.7's lint baseline for its unchanged application source.
    // TypeScript generation and gateway code retain the stricter rules above.
    files: ['**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/*.{test,spec}.{js,jsx}', 'tests/**/*.js'],
    languageOptions: { globals: { ...globals.vitest } },
  },
  {
    files: ['src/curriculumos/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'CurriculumOS is React-free by contract.',
            },
            {
              group: ['*hooks/*', '*components/*', '*contexts/*', '*screens/*', '*pages/*'],
              message: 'CurriculumOS may not depend on app UI layers.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage'],
    },
  },
];
