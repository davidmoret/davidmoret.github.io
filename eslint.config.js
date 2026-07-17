import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        __APP_VERSION__: 'readonly', // injecté par Vite (define)
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // Off : les parseurs binaires (ble/rower.js) avancent l'offset de façon
      // uniforme (o += N) par choix défensif, y compris sur le dernier champ.
      'no-useless-assignment': 'off',
    },
  },
  prettier,
];
