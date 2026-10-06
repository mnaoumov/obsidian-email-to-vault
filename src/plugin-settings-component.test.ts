import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventSource } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

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

function createMockPluginEventSource(): PluginEventSource {
  return strictProxy<PluginEventSource>({});
}

describe('PluginSettingsManager', () => {
  it('should validate email address through registered validator', async () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      pluginEventSource: createMockPluginEventSource(),
      pluginId: 'email-to-vault',
      pluginSettingsClass: PluginSettings
    });
    const settings = new PluginSettings();
    settings.emailAddress = 'email-to-vault-abc@mail.tm';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBeUndefined();
  });

  it('should return error for invalid email prefix', async () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      pluginEventSource: createMockPluginEventSource(),
      pluginId: 'email-to-vault',
      pluginSettingsClass: PluginSettings
    });
    const settings = new PluginSettings();
    settings.emailAddress = 'wrong@mail.tm';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBe('The email address must start with email-to-vault-');
  });

  it('should accept an address on a domain Mail.tm no longer offers for new accounts', async () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      pluginEventSource: createMockPluginEventSource(),
      pluginId: 'email-to-vault',
      pluginSettingsClass: PluginSettings
    });
    const settings = new PluginSettings();
    settings.emailAddress = 'email-to-vault-abc@retired-domain.com';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBeUndefined();
  });

  it('should return no error for empty email address', async () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      pluginEventSource: createMockPluginEventSource(),
      pluginId: 'email-to-vault',
      pluginSettingsClass: PluginSettings
    });
    const settings = new PluginSettings();
    settings.emailAddress = '';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBeUndefined();
  });

  it('should skip email validation when provider is not Mail.tm', async () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      pluginEventSource: createMockPluginEventSource(),
      pluginId: 'email-to-vault',
      pluginSettingsClass: PluginSettings
    });
    const settings = new PluginSettings();
    settings.emailProviderType = EmailProviderType.Imap;
    settings.emailAddress = 'any@example.com';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBeUndefined();
  });

  it.each(['', 'email-to-vault-password', 'a'.repeat(64)])('should accept the password secret key %j', async (secretKey) => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      pluginEventSource: createMockPluginEventSource(),
      pluginId: 'email-to-vault',
      pluginSettingsClass: PluginSettings
    });
    const settings = new PluginSettings();
    settings.emailPasswordSecretKey = secretKey;

    const result = await manager.validate(settings);

    expect(result.emailPasswordSecretKey).toBeUndefined();
  });

  // Obsidian's `setSecret` throws `Secret ID is invalid` for each of these, so a stored one broke the password field (#10).
  it.each([
    'Email-To-Vault-Password',
    'email to vault',
    'email_to_vault@password',
    'a'.repeat(65),
    42
  ])('should reject the password secret key %j', async (secretKey) => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      pluginEventSource: createMockPluginEventSource(),
      pluginId: 'email-to-vault',
      pluginSettingsClass: PluginSettings
    });
    const settings = new PluginSettings();
    castTo<Record<string, unknown>>(settings)['emailPasswordSecretKey'] = secretKey;

    const result = await manager.validate(settings);

    expect(result.emailPasswordSecretKey).toBe(
      'The password secret key must use only lowercase letters, numbers and dashes, 64 characters max'
    );
  });

  it('should read an invalid stored password secret key as empty', async () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler({ emailPasswordSecretKey: 'Not A Valid Key' }),
      pluginEventSource: createMockPluginEventSource(),
      pluginId: 'email-to-vault',
      pluginSettingsClass: PluginSettings
    });
    manager.load();
    await manager.loadFromFile(true);

    expect(manager.settings.emailPasswordSecretKey).toBe('');
  });

  it('should return error when IMAP host is empty for IMAP provider', async () => {
    const manager = new PluginSettingsComponent({
      dataHandler: new MockDataHandler(),
      pluginEventSource: createMockPluginEventSource(),
      pluginId: 'email-to-vault',
      pluginSettingsClass: PluginSettings
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
      pluginEventSource: createMockPluginEventSource(),
      pluginId: 'email-to-vault',
      pluginSettingsClass: PluginSettings
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
      pluginEventSource: createMockPluginEventSource(),
      pluginId: 'email-to-vault',
      pluginSettingsClass: PluginSettings
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
      pluginEventSource: createMockPluginEventSource(),
      pluginId: 'email-to-vault',
      pluginSettingsClass: PluginSettings
    });
    const settings = new PluginSettings();
    settings.emailProviderType = EmailProviderType.MailTm;
    settings.imapPort = 0;

    const result = await manager.validate(settings);

    expect(result.imapPort).toBeUndefined();
  });
});
