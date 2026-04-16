import { Notice } from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { appendCodeBlock } from 'obsidian-dev-utils/html-element';
import { confirm } from 'obsidian-dev-utils/obsidian/modals/confirm';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab-base';
import { SettingGroupEx } from 'obsidian-dev-utils/obsidian/setting-group-ex';

import type { MailTmManager } from './mail-tm-manager.ts';
import type { PluginTypes } from './plugin-types.ts';
import type { Plugin } from './plugin.ts';

import { TOKENIZED_STRING_LANGUAGE } from './prism-component.ts';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginTypes> {
  public constructor(plugin: Plugin, private readonly mailTmManager: MailTmManager) {
    super(plugin);
  }

  public override display(): void {
    super.display();

    const isRegistered = !!this.plugin.settings.emailAddress;

    new SettingGroupEx(this.containerEl)
      .setHeading('Mail.tm')
      .addSettingEx((setting) => {
        setting
          .setDesc(createFragment((f) => {
            f.appendText('The plugin is powered by ');
            f.createEl('a', { href: 'https://mail.tm/', text: 'mail.tm' });
            f.appendText(' — a temporary email service. Emails are stored for up to 7 days. See ');
            f.createEl('a', { href: 'https://github.com/mnaoumov/obsidian-email-to-vault#privacy--data-handling', text: 'Privacy & data handling' });
            f.appendText(' for details.');
          }));
      })
      .addSettingEx((setting) => {
        setting
          .addButton((button) => {
            if (isRegistered) {
              button
                .setButtonText('Unregister email address')
                .setWarning()
                .onClick(convertAsyncToSync(async () => {
                  const result = await confirm({
                    app: this.app,
                    cancelButtonText: 'No',
                    message: 'Are you sure you want to unregister your email address? You will not have access to it anymore.',
                    okButtonText: 'Yes',
                    title: 'Unregister email address?'
                  });
                  if (!result) {
                    return;
                  }

                  await this.mailTmManager.unregisterEmailAddress();
                  this.display();
                }));
            } else {
              button
                .setButtonText('Register new random email address')
                .onClick(convertAsyncToSync(async () => {
                  await this.mailTmManager.registerRandomEmailAddress();
                  this.display();
                }));
            }
          });
      })
      .addSettingEx((setting) => {
        setting
          .setClass('email-address')
          .setName('Email address')
          .setDesc('Email address for the mail.tm mailbox.')
          .addEmail((emailComponent) => {
            emailComponent.setDisabled(isRegistered);
            this.bind(emailComponent, 'emailAddress');
          })
          .addExtraButton((button) => {
            button
              .setTooltip('Copy to clipboard')
              .setIcon('clipboard')
              .onClick(convertAsyncToSync(async () => {
                await navigator.clipboard.writeText(this.plugin.settings.emailAddress);
                new Notice('Email address copied to clipboard');
              }));
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Email password')
          .setDesc('Password for the mail.tm mailbox.')
          .addPassword((passwordComponent) => {
            passwordComponent.setDisabled(isRegistered);
            const password = this.app.secretStorage.getSecret(this.plugin.settings.emailPasswordSecretKey) ?? '';
            passwordComponent.setValue(password);
            if (!isRegistered) {
              passwordComponent.onChange(convertAsyncToSync(async (value: string) => {
                await this.ensurePasswordSecretKey();
                this.app.secretStorage.setSecret(this.plugin.settings.emailPasswordSecretKey, value);
              }));
            }
          })
          .addExtraButton((button) => {
            button
              .setTooltip('Copy to clipboard')
              .setIcon('clipboard')
              .onClick(convertAsyncToSync(async () => {
                const password = this.app.secretStorage.getSecret(this.plugin.settings.emailPasswordSecretKey);
                if (!password) {
                  new Notice('No email password found');
                  return;
                }
                await navigator.clipboard.writeText(password);
                new Notice('Email password copied to clipboard');
              }));
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Delete seen emails')
          .setDesc(createFragment((f) => {
            f.appendText('Whether to delete emails from the mailbox after being saved as notes.');
            f.createEl('br');
            f.appendText('⚠️ WARNING: deleted emails cannot be recovered.');
            f.createEl('br');
            f.appendText('⚠️ WARNING: even if the setting is disabled, the emails will be deleted after 7 days. See ');
            f.createEl('a', { href: 'https://github.com/mnaoumov/obsidian-email-to-vault#privacy--data-handling', text: 'Privacy & data handling' });
            f.appendText(' for details.');
          }))
          .addToggle((toggle) => {
            this.bind(toggle, 'shouldDeleteSeenEmails');
          });
      });

    new SettingGroupEx(this.containerEl)
      .setHeading('Main')
      .addSettingEx((setting) => {
        setting
          .setName('Email check interval')
          .setDesc(createFragment((f) => {
            f.appendText('The interval at which emails will be checked in minutes.');
            f.createEl('br');
            f.appendText('Set to 0 to disable automatic email checking.');
          }))
          .addNumber((numberComponent) => {
            numberComponent.setMin(0);
            this.bind(numberComponent, 'emailCheckIntervalInMinutes');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Email note path template')
          .setDesc(createFragment((f) => {
            f.appendText('Path template for saved email notes.');
            f.createEl('br');
            appendVariables(f);
          }))
          .addCodeHighlighter((codeHighlighter) => {
            codeHighlighter.setLanguage(TOKENIZED_STRING_LANGUAGE);
            this.bind(codeHighlighter, 'emailNotePathTemplate');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setClass('email-note-template')
          .setName('Email note template')
          .setDesc(createFragment((f) => {
            f.appendText('The template to use for email note content.');
            f.createEl('br');
            appendVariables(f);
          }))
          .addCodeHighlighter((codeHighlighter) => {
            codeHighlighter.setLanguage(TOKENIZED_STRING_LANGUAGE);
            this.bind(codeHighlighter, 'emailNoteTemplate');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Extract forwarded email')
          .setDesc(createFragment((f) => {
            f.appendText('Whether to extract the original sender, recipients, and subject from forwarded emails.');
            f.createEl('br');
            f.appendText('When enabled, treats forwarded emails as direct messages.');
          }))
          .addToggle((toggle) => {
            this.bind(toggle, 'shouldExtractForwardedEmail');
          });
      });
  }

  private async ensurePasswordSecretKey(): Promise<void> {
    if (this.plugin.settings.emailPasswordSecretKey) {
      return;
    }

    const secretKey = `${this.plugin.manifest.id}-password`;
    await this.plugin.settingsManager.editAndSave((settings) => {
      settings.emailPasswordSecretKey = secretKey;
    });
  }
}

function appendVariables(f: DocumentFragment): void {
  const variables = ['{{cc}}', '{{date:FORMAT}}', '{{from}}', '{{subject}}', '{{to}}'];

  f.appendText('Variables:');
  const ol = f.createEl('ul');
  for (const variable of variables) {
    const li = ol.createEl('li');
    appendCodeBlock(li, variable);
  }

  f.appendText('Date format uses ');
  f.createEl('a', { href: 'https://momentjs.com/docs/#/displaying/format/', text: 'Moment.js format' });
  f.appendText('.');
}
