import type { MaybeReturn } from 'obsidian-dev-utils/type';

import { PluginSettingsManagerBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-manager-base';

import type { MailTmManager } from './mail-tm-manager.ts';
import type { PluginTypes } from './plugin-types.ts';
import type { Plugin } from './plugin.ts';

import { PluginSettings } from './plugin-settings.ts';

export class PluginSettingsManager extends PluginSettingsManagerBase<PluginTypes> {
  public constructor(plugin: Plugin, private readonly mailTmManager: MailTmManager) {
    super(plugin);
  }

  protected createDefaultSettings(): PluginSettings {
    return new PluginSettings();
  }

  protected override registerValidators(): void {
    this.registerValidator('emailAddress', async (value): Promise<MaybeReturn<string>> => {
      return this.validateEmailAddress(value);
    });
  }

  private async validateEmailAddress(value: string): Promise<MaybeReturn<string>> {
    if (!value) {
      return;
    }
    const expectedPrefix = `${this.plugin.manifest.id}-`;
    if (!value.startsWith(expectedPrefix)) {
      return `The email address must start with ${expectedPrefix}`;
    }
    const isValidDomain = await this.mailTmManager.validateEmailDomain(value);
    if (!isValidDomain) {
      return 'The email address domain is not a valid Mail.tm domain';
    }
  }
}
