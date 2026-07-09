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
              acronyms: ['HTML', 'IMAP', 'TLS', 'SSL'],
              brands: ['mail.tm']
            }
          ]
        }
      },
      {
        // No-app integration tests run in a plain Node.js environment (no Obsidian, no `window`).
        // Native globals such as `fetch` are therefore reached through `globalThis`.
        files: ['**/*.no-app.integration.test.ts'],
        rules: {
          'obsidianmd/no-global-this': 'off'
        }
      }
    ]);
  }
});
