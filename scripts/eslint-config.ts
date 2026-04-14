import type { Linter } from 'eslint';

import { defineEslintConfigs } from 'obsidian-dev-utils/script-utils/linters/eslint-config';

export const configs: Linter.Config[] = [
  ...defineEslintConfigs(),
  {
    files: ['**/src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/dot-notation': ['error', {
        allowPrivateClassPropertyAccess: true,
        allowProtectedClassPropertyAccess: true
      }],
      '@typescript-eslint/unbound-method': 'off'
    }
  }
];
