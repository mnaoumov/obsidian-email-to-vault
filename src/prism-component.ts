/* v8 ignore start -- Prism syntax highlighting requires Obsidian runtime. */

import { loadPrism } from '@obsidian-typings/obsidian-public-latest/implementations';
import { AsyncComponent } from 'obsidian-dev-utils/obsidian/components/async-component';

export const TOKENIZED_STRING_LANGUAGE = 'email-to-vault-template';

export class PrismComponent extends AsyncComponent {
  public override async onload(): Promise<void> {
    await super.onload();
    await this.initPrism();
  }

  private async initPrism(): Promise<void> {
    const prism = await loadPrism();
    prism.languages[TOKENIZED_STRING_LANGUAGE] = {
      expression: {
        greedy: true,
        inside: {
          /* eslint-disable perfectionist/sort-objects -- Need to keep object order for Prism tokenization. */
          prefix: {
            alias: 'regex',
            pattern: /\{\{/
          },
          token: {
            alias: 'number',
            pattern: /^[a-zA-Z0-9_]+/
          },
          formatDelimiter: {
            alias: 'regex',
            pattern: /:/
          },
          format: {
            alias: 'string',
            pattern: /[a-zA-Z0-9_-]+/
          },
          suffix: {
            alias: 'regex',
            pattern: /\}\}/
          }
          /* eslint-enable perfectionist/sort-objects -- Need to keep object order for Prism tokenization. */
        },
        pattern: /\{\{.+?\}\}/
      }
    };

    this.register(() => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Need to delete language on unload.
      delete prism.languages[TOKENIZED_STRING_LANGUAGE];
    });
  }
}

/* v8 ignore stop */
