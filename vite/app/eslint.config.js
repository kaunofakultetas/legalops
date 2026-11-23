// -----------------------------------------------------------
//  [*] ESLint configuration (flat config)
//
//  Standard Vite + React setup: JS recommended rules plus the
//  react-hooks rules. The vitest suite (tests/) and the build
//  guard (scripts/) run in Node, so they get Node globals.
//  Run inside a node container:
//  npm run lint
// -----------------------------------------------------------

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist', 'coverage'] },
  // The build guard (scripts/check-messages.js) is a Node
  // program, not browser code — process, import.meta.url & co
  { files: ['scripts/**/*.js'], languageOptions: { globals: globals.node } },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      // typeof on an undeclared identifier is legal JS, so
      // without this a stale `typeof x` guard passes silently
      'no-undef': ['error', { typeof: true }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  // The vitest suite runs in Node (vitest + jsdom) — process &
  // co are real there — and fast refresh never loads a test
  // file, so its support modules may export helpers next to
  // components
  {
    files: ['tests/**/*.{js,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'react-refresh/only-export-components': 'off' },
  },
];
