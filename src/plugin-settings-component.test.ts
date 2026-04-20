import type { PluginSettingsComponentParams } from 'obsidian-dev-utils/obsidian/plugin/components/plugin-settings-component';

import { noopAsync } from 'obsidian-dev-utils/function';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { MailTmDomainManager } from './mail-tm-domain-manager.ts';

import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettings } from './plugin-settings.ts';

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return { ...original };
});

function createMailTmDomainManager(isValidDomain: boolean): MailTmDomainManager {
  return strictProxy<MailTmDomainManager>({
    validateEmailDomain: vi.fn(async () => {
      await noopAsync();
      return isValidDomain;
    })
  });
}

function createMockPluginSettingsComponentParams(): PluginSettingsComponentParams {
  return strictProxy<PluginSettingsComponentParams>({
    loadData: vi.fn(async () => {
      await noopAsync();
      return {};
    }),
    saveData: vi.fn(async () => {
      await noopAsync();
    })
  });
}

describe('PluginSettingsManager', () => {
  it('should create default settings', () => {
    const manager = new PluginSettingsComponent(createMockPluginSettingsComponentParams(), 'email-to-vault', createMailTmDomainManager(true));
    const settings = manager['createDefaultSettings']();

    expect(settings).toBeInstanceOf(PluginSettings);
  });

  it('should validate email address through registered validator', async () => {
    const manager = new PluginSettingsComponent(createMockPluginSettingsComponentParams(), 'email-to-vault', createMailTmDomainManager(true));
    const settings = new PluginSettings();
    settings.emailAddress = 'email-to-vault-abc@mail.tm';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBeUndefined();
  });

  it('should return error for invalid email prefix', async () => {
    const manager = new PluginSettingsComponent(createMockPluginSettingsComponentParams(), 'email-to-vault', createMailTmDomainManager(true));
    const settings = new PluginSettings();
    settings.emailAddress = 'wrong@mail.tm';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBe('The email address must start with email-to-vault-');
  });

  it('should return error for invalid domain', async () => {
    const manager = new PluginSettingsComponent(createMockPluginSettingsComponentParams(), 'email-to-vault', createMailTmDomainManager(false));
    const settings = new PluginSettings();
    settings.emailAddress = 'email-to-vault-abc@invalid.com';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBe('The email address domain is not a valid Mail.tm domain');
  });

  it('should return no error for empty email address', async () => {
    const manager = new PluginSettingsComponent(createMockPluginSettingsComponentParams(), 'email-to-vault', createMailTmDomainManager(true));
    const settings = new PluginSettings();
    settings.emailAddress = '';

    const result = await manager.validate(settings);

    expect(result.emailAddress).toBeUndefined();
  });

  it('should not validate domain when prefix check fails', async () => {
    const mockManager = createMailTmDomainManager(true);
    const manager = new PluginSettingsComponent(createMockPluginSettingsComponentParams(), '', mockManager);
    const settings = new PluginSettings();
    settings.emailAddress = 'wrong@mail.tm';

    await manager.validate(settings);

    expect(mockManager.validateEmailDomain).not.toHaveBeenCalled();
  });
});
