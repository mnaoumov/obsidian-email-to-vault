import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { MailTmManager } from './mail-tm-manager.ts';
import type { Plugin } from './plugin.ts';

import { PluginSettingsManager } from './plugin-settings-manager.ts';
import { PluginSettings } from './plugin-settings.ts';

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return { ...original };
});

function createMockMailTmManager(isValidDomain: boolean): MailTmManager {
  return strictProxy<MailTmManager>({
    validateEmailDomain: vi.fn(async () => isValidDomain)
  });
}

function createMockPlugin(): Plugin {
  return strictProxy<Plugin>({
    app: {},
    manifest: { id: 'email-to-vault' }
  });
}

describe('PluginSettingsManager', () => {
  it('should create default settings', () => {
    const manager = new PluginSettingsManager(createMockPlugin(), createMockMailTmManager(true));
    const settings = manager['createDefaultSettings']();

    expect(settings).toBeInstanceOf(PluginSettings);
  });

  it('should validate email address through registered validator', async () => {
    const manager = new PluginSettingsManager(createMockPlugin(), createMockMailTmManager(true));
    const settings = new PluginSettings();
    settings.emailAddress = 'email-to-vault-abc@mail.tm';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBeUndefined();
  });

  it('should return error for invalid email prefix', async () => {
    const manager = new PluginSettingsManager(createMockPlugin(), createMockMailTmManager(true));
    const settings = new PluginSettings();
    settings.emailAddress = 'wrong@mail.tm';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBe('The email address must start with email-to-vault-');
  });

  it('should return error for invalid domain', async () => {
    const manager = new PluginSettingsManager(createMockPlugin(), createMockMailTmManager(false));
    const settings = new PluginSettings();
    settings.emailAddress = 'email-to-vault-abc@invalid.com';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBe('The email address domain is not a valid Mail.tm domain');
  });

  it('should return no error for empty email address', async () => {
    const manager = new PluginSettingsManager(createMockPlugin(), createMockMailTmManager(true));
    const settings = new PluginSettings();
    settings.emailAddress = '';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBeUndefined();
  });

  it('should not validate domain when prefix check fails', async () => {
    const mockManager = createMockMailTmManager(true);
    const manager = new PluginSettingsManager(createMockPlugin(), mockManager);
    const settings = new PluginSettings();
    settings.emailAddress = 'wrong@mail.tm';

    await manager.validate(settings);

    expect(mockManager.validateEmailDomain).not.toHaveBeenCalled();
  });
});
