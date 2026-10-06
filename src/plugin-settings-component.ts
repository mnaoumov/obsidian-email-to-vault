import type { PluginSettingsComponentBaseConstructorParams } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';
import type { MaybeReturn } from 'obsidian-dev-utils/type';

import { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import { PluginSettings } from './plugin-settings.ts';
import { EmailProviderType } from './providers/email-provider-type.ts';

interface PluginSettingsComponentConstructorParams extends PluginSettingsComponentBaseConstructorParams<PluginSettings> {
  readonly pluginId: string;
}

export class PluginSettingsComponent extends PluginSettingsComponentBase<PluginSettings> {
  private readonly pluginId: string;

  public constructor(params: PluginSettingsComponentConstructorParams) {
    super(params);
    this.pluginId = params.pluginId;
  }

  protected override registerValidators(): void {
    super.registerValidators();
    this.registerValidator('emailAddress', (value, settings): MaybeReturn<string> => {
      if (settings.emailProviderType === EmailProviderType.MailTm) {
        return this.validateMailTmEmailAddress(value);
      }
    });
    this.registerValidator('emailPasswordSecretKey', (value): MaybeReturn<string> => validateSecretKey(value));
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
      const MAX_PORT = 65_535;
      if (settings.imapPort < MIN_PORT || settings.imapPort > MAX_PORT) {
        return `IMAP port must be between ${String(MIN_PORT)} and ${String(MAX_PORT)}`;
      }
    });
  }

  // The domain is deliberately not checked against Mail.tm's `/domains` list (#10). That list holds the domains NEW
  // accounts can be created on, and Mail.tm drops a domain from it while accounts already on it keep working. A failed
  // validation also resets the effective address to its empty default, so such a check stopped every mail check.
  private validateMailTmEmailAddress(value: string): MaybeReturn<string> {
    if (!value) {
      return;
    }
    const expectedPrefix = `${this.pluginId}-`;
    if (!value.startsWith(expectedPrefix)) {
      return `The email address must start with ${expectedPrefix}`;
    }
  }
}

// Mirrors the check Obsidian's `secretStorage.setSecret` applies to a secret ID. A stored key that fails it can neither
// read the password back nor save a new one (#10), so it is rejected here: the effective key then falls back to empty,
// and the next password entered is saved under a freshly derived key.
const SECRET_KEY_PATTERN = /^[a-z0-9-]+$/;
const SECRET_KEY_MAX_LENGTH = 64;

function validateSecretKey(value: unknown): MaybeReturn<string> {
  if (value === '') {
    return;
  }
  if (typeof value !== 'string' || !SECRET_KEY_PATTERN.test(value) || value.length > SECRET_KEY_MAX_LENGTH) {
    return 'The password secret key must use only lowercase letters, numbers and dashes, 64 characters max';
  }
}
