import { SyntaxHighlightingComponent } from 'obsidian-dev-utils/obsidian/components/syntax-highlighting-component';

export const TOKENIZED_STRING_LANGUAGE = 'email-to-vault-template';

/**
 * Registers the Prism language highlighting the `{{token}}` / `{{token:format}}` placeholders of the
 * plugin's note templates.
 *
 * The language is not a code fence — it is rendered only by the `CodeHighlighterComponent` fields of the
 * settings tab, so only the Prism half of {@link SyntaxHighlightingComponent} is used. The grammar
 * references no other language, so it is passed in its plain form rather than through the factory.
 */
export class TokenizedStringLanguageComponent extends SyntaxHighlightingComponent {
  public override async onloadAsync(): Promise<void> {
    await this.registerPrismLanguage({
      grammar: {
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
      },
      language: TOKENIZED_STRING_LANGUAGE
    });
  }
}
