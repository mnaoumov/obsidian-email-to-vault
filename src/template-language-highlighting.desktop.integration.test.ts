import type { PrismModule } from '@obsidian-typings/obsidian-public-latest';

import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

// Declared here rather than imported from `tokenized-string-language-component.ts`: this file runs in Node,
// And that module pulls in `obsidian`, which only resolves inside the app.
const TOKENIZED_STRING_LANGUAGE = 'email-to-vault-template';

describe('template language', () => {
  it('highlights the {{token:format}} placeholders of a template through real Prism', async () => {
    const result = await evalInObsidian({
      // eslint-disable-next-line unicorn/name-replacements -- `args` is an `obsidian-integration-testing` parameter name.
      args: { language: TOKENIZED_STRING_LANGUAGE },
      // eslint-disable-next-line unicorn/name-replacements -- `fn` is an `obsidian-integration-testing` parameter name.
      async fn({ language, lib: { waitUntil }, obsidianModule }) {
        // `obsidian`'s own `loadPrism()` is typed as returning `unknown`.
        const prism = await obsidianModule.loadPrism() as PrismModule;

        await waitUntil({
          message: `Prism language "${language}" was not registered`,
          predicate: () => prism.languages[language] !== undefined
        });

        const grammar = prism.languages[language];
        if (!grammar) {
          throw new Error(`Prism language "${language}" is missing.`);
        }

        return { html: prism.highlight('{{date:YYYY-MM-DD}}', grammar, language) };
      }
    });

    // The settings tab's code-highlighter fields render exactly this markup, so this asserts what the
    // User sees: each part of `{{date:YYYY-MM-DD}}` carries its own token class.
    expect(result.html).toContain('class="token prefix regex"');
    expect(result.html).toContain('class="token token number"');
    expect(result.html).toContain('class="token formatDelimiter regex"');
    expect(result.html).toContain('class="token format string"');
    expect(result.html).toContain('class="token suffix regex"');
    expect(result.html).toContain('YYYY-MM-DD');
  });
});
