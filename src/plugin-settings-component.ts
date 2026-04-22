import type { PluginSettingsComponentParams } from 'obsidian-dev-utils/obsidian/plugin/components/plugin-settings-component';
import type { MaybeReturn } from 'obsidian-dev-utils/type';

import { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/plugin/components/plugin-settings-component';

import type { MailTmDomainManager } from './providers/mail-tm/mail-tm-domain-manager.ts';

import { PluginSettings } from './plugin-settings.ts';
import { EmailProviderType } from './providers/email-provider-type.ts';

export class PluginSettingsComponent extends PluginSettingsComponentBase<PluginSettings> {
  public constructor(params: PluginSettingsComponentParams, private readonly pluginId: string, private readonly mailTmDomainManager: MailTmDomainManager) {
    super(params);
  }

  protected override createDefaultSettings(): PluginSettings {
    return new PluginSettings();
  }

  protected override registerValidators(): void {
    this.registerValidator('emailAddress', async (value, settings): Promise<MaybeReturn<string>> => {
      if (settings.emailProviderType === EmailProviderType.MailTm) {
        return this.validateMailTmEmailAddress(value);
      }
    });
  }

  private async validateMailTmEmailAddress(value: string): Promise<MaybeReturn<string>> {
    if (!value) {
      return;
    }
    const expectedPrefix = `${this.pluginId}-`;
    if (!value.startsWith(expectedPrefix)) {
      return `The email address must start with ${expectedPrefix}`;
    }
    const isValidDomain = await this.mailTmDomainManager.validateEmailDomain(value);
    if (!isValidDomain) {
      return 'The email address domain is not a valid Mail.tm domain';
    }
  }
}
