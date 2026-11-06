import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'release/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node, chrome: 'readonly' } },
    rules: {
      'no-restricted-syntax': ['error',
        { selector: "CallExpression[callee.name='eval']", message: 'No eval in an extension.' },
        { selector: "NewExpression[callee.name='Function']", message: 'No dynamic code.' },
        { selector: "MemberExpression[property.name='innerHTML']", message: 'Use textContent or DOM APIs.' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
