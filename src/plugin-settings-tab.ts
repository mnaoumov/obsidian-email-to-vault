import { SecretComponent } from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { appendCodeBlock } from 'obsidian-dev-utils/html-element';
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

    new SettingGroupEx(this.containerEl)
      .setHeading('Mail.tm')
      .addSettingEx((setting) => {
        setting
          .addButton((button) =>
            button
              .setButtonText('Register random email address')
              .setDisabled(this.plugin.settings.emailAddress !== '')
              .onClick(convertAsyncToSync(async () => {
                await this.mailTmManager.registerRandomEmailAddress();
                this.display();
              }))
          );
      })
      .addSettingEx((setting) => {
        setting
          .setClass('email-address')
          .setName('Email address')
          .setDesc('The email address to check for emails.')
          .addEmail((emailComponent) => {
            this.bind(emailComponent, 'emailAddress');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Email password secret key')
          .setDesc('The secret key to access the email password.');

        const secretComponent = new SecretComponent(this.app, setting.settingEl);
        secretComponent.setValue(this.plugin.settings.emailPasswordSecretKey);
        secretComponent.onChange(convertAsyncToSync(async (value) => {
          await this.plugin.settingsManager.editAndSave((settings) => {
            settings.emailPasswordSecretKey = value;
          });
        }));
      })
      .addSettingEx((setting) => {
        setting
          .setName('Delete seen emails')
          .setDesc(createFragment((f) => {
            f.appendText('Whether to delete emails from the mailbox after being saved as notes.');
            f.createEl('br');
            f.appendText('⚠️ WARNING: deleted emails cannot be recovered.');
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
