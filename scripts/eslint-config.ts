import type { Linter } from 'eslint';

import { defineConfig } from 'eslint/config';
import { defineEslintConfigs } from 'obsidian-dev-utils/script-utils/linters/eslint-config';

export const configs: Linter.Config[] = defineEslintConfigs({
  customConfigs() {
    return defineConfig([
      {
        rules: {
          'obsidianmd/ui/sentence-case': [
            'error',
            {
              brands: ['mail.tm']
            }
          ]
        }
      },
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
    ]);
  }
});
