import { SecretComponent } from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/async';
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
          .setName('Email address')
          .setDesc('The email address to check for emails.')
          .addEmail((emailComponent) => {
            this.bind(emailComponent, 'emailAddress');
          })
          .addButton((button) =>
            button
              .setButtonText('Get new email address')
              .setDisabled(this.plugin.settings.emailAddress !== '')
              .onClick(convertAsyncToSync(async () => {
                await this.mailTmManager.getNewEmailAddress();
                this.display();
              }))
          );
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
            this.bind(numberComponent, 'emailCheckIntervalInMinutes');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Email note path template')
          .setDesc(createFragment((f) => {
            f.appendText('Path template for saved email notes.');
            f.createEl('br');
            f.appendText('Variables: {{date:FORMAT}}, {{subject}}, {{from}}, {{to}}, {{cc}}');
            f.createEl('br');
            f.appendText('Date format tokens: YYYY, MM, DD, HH, mm, ss');
          }))
          .addCodeHighlighter((codeHighlighter) => {
            codeHighlighter.setLanguage(TOKENIZED_STRING_LANGUAGE);
            this.bind(codeHighlighter, 'emailNotePathTemplate');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Email note template')
          .setDesc('The template to use for email note content.')
          .addTextArea((textArea) => {
            this.bind(textArea, 'emailNoteTemplate', {
              shouldShowPlaceholderForDefaultValues: false
            });
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Delete seen emails')
          .setDesc(createFragment((f) => {
            f.appendText('When enabled, emails are deleted from the mailbox after being saved as notes.');
            f.createEl('br');
            f.appendText('Warning: deleted emails cannot be recovered.');
          }))
          .addToggle((toggle) => {
            this.bind(toggle, 'shouldDeleteSeenEmails');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Strip forward markers')
          .setDesc(createFragment((f) => {
            f.appendText('When enabled, treats forwarded emails as direct messages.');
            f.createEl('br');
            f.appendText('Extracts original sender, recipients, and subject from Gmail/Outlook forward headers.');
          }))
          .addToggle((toggle) => {
            this.bind(toggle, 'shouldStripForwardMarkers');
          });
      });
  }
}
