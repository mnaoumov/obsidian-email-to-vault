import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { MaybeReturn } from 'obsidian-dev-utils/type';

import { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/plugin/components/plugin-settings-component';

import type { MailTmDomainManager } from './providers/mail-tm/mail-tm-domain-manager.ts';

import { PluginSettings } from './plugin-settings.ts';
import { EmailProviderType } from './providers/email-provider-type.ts';

interface PluginSettingsComponentConstructorParams {
  dataHandler: DataHandler;
  mailTmDomainManager: MailTmDomainManager;
  pluginId: string;
}

export class PluginSettingsComponent extends PluginSettingsComponentBase<PluginSettings> {
  private readonly mailTmDomainManager: MailTmDomainManager;
  private readonly pluginId: string;

  public constructor(params: PluginSettingsComponentConstructorParams) {
    super(params.dataHandler);
    this.pluginId = params.pluginId;
    this.mailTmDomainManager = params.mailTmDomainManager;
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
    this.registerValidator('imapHost', (_value, settings): MaybeReturn<string> => {
      if (settings.emailProviderType === EmailProviderType.Imap && !settings.imapHost) {
        return 'IMAP host is required';
      }
    });
    this.registerValidator('imapPort', (_value, settings): MaybeReturn<string> => {
      if (settings.emailProviderType !== EmailProviderType.Imap) {
        return;
      }
      const MIN_PORT = 1;
      const MAX_PORT = 65535;
      if (settings.imapPort < MIN_PORT || settings.imapPort > MAX_PORT) {
        return `IMAP port must be between ${String(MIN_PORT)} and ${String(MAX_PORT)}`;
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
