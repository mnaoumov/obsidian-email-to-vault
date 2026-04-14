import { SecretComponent } from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab-base';
import { SettingGroupEx } from 'obsidian-dev-utils/obsidian/setting-group-ex';

import type { MailTmManager } from './mail-tm-manager.ts';
import type { PluginTypes } from './plugin-types.ts';
import type { Plugin } from './plugin.ts';

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
          .setName('Email notes folder')
          .setDesc('The folder where email notes will be stored.')
          .addText((text) => {
            this.bind(text, 'emailNotesFolder');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Email note template')
          .setDesc('The template to use for email notes.')
          .addTextArea((textArea) => {
            this.bind(textArea, 'emailNoteTemplate', {
              shouldShowPlaceholderForDefaultValues: false
            });
          });
      });
  }
}
