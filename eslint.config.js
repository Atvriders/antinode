import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', 'screenshots'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      // Zustand actions are plain closures in an object literal, never class
      // methods, and none of them reads `this`. Selecting one with
      // `useStation((s) => s.setFreq)` is the library's intended usage, and the
      // rule flags every single one of them as a possible unbound method.
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // The RF core is the specification: it must stay pure and deterministic.
    files: ['src/rf/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', { name: 'Date', message: 'src/rf must be deterministic.' }],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'src/rf must be deterministic.' },
        { object: 'Date', property: 'now', message: 'src/rf must be deterministic.' },
      ],
    },
  },
)
