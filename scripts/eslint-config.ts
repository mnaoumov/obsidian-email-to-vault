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
        /*
         * No-app integration tests run in a plain Node.js environment (no Obsidian, no `window`), so
         * native globals such as `fetch` are reached through `globalThis`. They also drive the real
         * mail.tm API rather than Obsidian, so Obsidian's `requestUrl` is not the right call there and
         * the ban on the native `fetch` does not apply.
         */
        files: ['**/*.no-app.integration.test.ts'],
        rules: {
          'no-restricted-globals': 'off',
          'obsidianmd/no-global-this': 'off'
        }
      }
    ]);
  }
});
