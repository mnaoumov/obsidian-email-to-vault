import type { Linter } from 'eslint';

import { defineEslintConfigs } from '@mnaoumov/obsidian-dev-toolkit/linters/eslint-config';
import { defineConfig } from 'eslint/config';

export const configs: Linter.Config[] = defineEslintConfigs({
  customConfigs(context) {
    return defineConfig([
      {
        rules: {
          'obsidianmd/ui/sentence-case': [
            'error',
            {
              acronyms: ['HTML', 'IMAP', 'TLS', 'SSL'],
              brands: ['Mail.tm']
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
      },
      {
        // Scoped like the toolkit's own in-house block, the only one that loads the `typescript-dev-toolkit` plugin.
        files: context.allFiles(),
        rules: {
          'typescript-dev-toolkit/no-undefined-return-type': 'error'
        }
      }
    ]);
  }
});
