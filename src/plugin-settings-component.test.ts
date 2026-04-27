import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';

import { noopAsync } from 'obsidian-dev-utils/function';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { MailTmDomainManager } from './providers/mail-tm/mail-tm-domain-manager.ts';

import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettings } from './plugin-settings.ts';
import { EmailProviderType } from './providers/email-provider-type.ts';

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return { ...original };
});

class MockDataHandler implements DataHandler {
  private data: unknown;

  public constructor(data: unknown = {}) {
    this.data = data;
  }

  public async loadData(): Promise<unknown> {
    await noopAsync();
    return this.data;
  }

  public async saveData(data: unknown): Promise<void> {
    this.data = data;
    await noopAsync();
  }
}

function createMailTmDomainManager(isValidDomain: boolean): MailTmDomainManager {
  return strictProxy<MailTmDomainManager>({
    validateEmailDomain: vi.fn(async () => {
      await noopAsync();
      return isValidDomain;
    })
  });
}

describe('PluginSettingsManager', () => {
  it('should create default settings', () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      mailTmDomainManager: createMailTmDomainManager(true),
      pluginId: 'email-to-vault'
    });
    const settings = manager['createDefaultSettings']();

    expect(settings).toBeInstanceOf(PluginSettings);
  });

  it('should validate email address through registered validator', async () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      mailTmDomainManager: createMailTmDomainManager(true),
      pluginId: 'email-to-vault'
    });
    const settings = new PluginSettings();
    settings.emailAddress = 'email-to-vault-abc@mail.tm';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBeUndefined();
  });

  it('should return error for invalid email prefix', async () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      mailTmDomainManager: createMailTmDomainManager(true),
      pluginId: 'email-to-vault'
    });
    const settings = new PluginSettings();
    settings.emailAddress = 'wrong@mail.tm';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBe('The email address must start with email-to-vault-');
  });

  it('should return error for invalid domain', async () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      mailTmDomainManager: createMailTmDomainManager(false),
      pluginId: 'email-to-vault'
    });
    const settings = new PluginSettings();
    settings.emailAddress = 'email-to-vault-abc@invalid.com';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBe('The email address domain is not a valid Mail.tm domain');
  });

  it('should return no error for empty email address', async () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      mailTmDomainManager: createMailTmDomainManager(true),
      pluginId: 'email-to-vault'
    });
    const settings = new PluginSettings();
    settings.emailAddress = '';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBeUndefined();
  });

  it('should not validate domain when prefix check fails', async () => {
    const mockManager = createMailTmDomainManager(true);
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      mailTmDomainManager: createMailTmDomainManager(true),
      pluginId: 'email-to-vault'
    });
    const settings = new PluginSettings();
    settings.emailAddress = 'wrong@mail.tm';

    await manager.validate(settings);

    expect(mockManager.validateEmailDomain).not.toHaveBeenCalled();
  });

  it('should skip email validation when provider is not Mail.tm', async () => {
    const mockManager = createMailTmDomainManager(false);
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      mailTmDomainManager: createMailTmDomainManager(false),
      pluginId: 'email-to-vault'
    });
    const settings = new PluginSettings();
    settings.emailProviderType = EmailProviderType.Imap;
    settings.emailAddress = 'any@example.com';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBeUndefined();
    expect(mockManager.validateEmailDomain).not.toHaveBeenCalled();
  });

  it('should return error when IMAP host is empty for IMAP provider', async () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      mailTmDomainManager: createMailTmDomainManager(true),
      pluginId: 'email-to-vault'
    });
    const settings = new PluginSettings();
    settings.emailProviderType = EmailProviderType.Imap;
    settings.imapHost = '';

    const result = await manager.validate(settings);

    expect(result.imapHost).toBe('IMAP host is required');
  });

  it('should not validate IMAP host when provider is not IMAP', async () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      mailTmDomainManager: createMailTmDomainManager(true),
      pluginId: 'email-to-vault'
    });
    const settings = new PluginSettings();
    settings.emailProviderType = EmailProviderType.MailTm;
    settings.imapHost = '';

    const result = await manager.validate(settings);

    expect(result.imapHost).toBeUndefined();
  });

  it('should return error for invalid IMAP port', async () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      mailTmDomainManager: createMailTmDomainManager(true),
      pluginId: 'email-to-vault'
    });
    const settings = new PluginSettings();
    settings.emailProviderType = EmailProviderType.Imap;
    settings.imapHost = 'imap.example.com';
    settings.imapPort = 0;

    const result = await manager.validate(settings);

    expect(result.imapPort).toBe('IMAP port must be between 1 and 65535');
  });

  it('should not validate IMAP port when provider is not IMAP', async () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      mailTmDomainManager: createMailTmDomainManager(true),
      pluginId: 'email-to-vault'
    });
    const settings = new PluginSettings();
    settings.emailProviderType = EmailProviderType.MailTm;
    settings.imapPort = 0;

    const result = await manager.validate(settings);

    expect(result.imapPort).toBeUndefined();
  });
});
