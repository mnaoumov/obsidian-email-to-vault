import type { App } from 'obsidian';
import type { AsyncEventRef } from 'obsidian-dev-utils/async-events';
import type { ReadonlyPluginSettingsState } from 'obsidian-dev-utils/obsidian/plugin/components/plugin-settings-component';
import type { Promisable } from 'type-fest';

import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from '../plugin-settings-component.ts';
import type { PluginSettings } from '../plugin-settings.ts';
import type { EmailMessageFull } from './email-provider-types.ts';
import type { MailTmDomainManager } from './mail-tm/mail-tm-domain-manager.ts';

import { EmailProviderManager } from './email-provider-manager.ts';
import { EmailProviderType } from './email-provider-type.ts';

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    Component: class MockComponent {
      public addChild<T>(child: T): T {
        return child;
      }

      public onload(): void {
        // Noop
      }

      public removeChild<T>(child: T): T {
        return child;
      }
    }
  };
});

const mocks = vi.hoisted(() => ({
  mockMailTmProviderInstance: null as null | Record<string, ReturnType<typeof vi.fn>>
}));

vi.mock('./mail-tm/mail-tm-provider.ts', () => {
  class MockMailTmProvider {
    public deleteMessage = vi.fn(async () => noopAsync());

    public downloadAttachment = vi.fn(async () => {
      await noopAsync();
      return new ArrayBuffer(0);
    });

    public getMessage = vi.fn(async () => {
      await noopAsync();
      return {} as EmailMessageFull;
    });

    public getMessages = vi.fn(async () => {
      await noopAsync();
      return [];
    });

    public markMessageAsSeen = vi.fn(async () => noopAsync());

    public constructor() {
      mocks.mockMailTmProviderInstance = castTo<Record<string, ReturnType<typeof vi.fn>>>(this);
    }
  }
  return { MailTmProvider: MockMailTmProvider };
});

vi.mock('obsidian-dev-utils/obsidian/components/async-events-component', () => ({
  registerAsyncEvent: vi.fn()
}));

interface CreateMockPluginSettingsComponentResult {
  pluginSettingsComponent: PluginSettingsComponent;
  triggerSaveSettings: (newState: ReadonlyPluginSettingsState<PluginSettings>, oldState: ReadonlyPluginSettingsState<PluginSettings>) => void;
}

type SaveSettingsCallback = (
  newState: ReadonlyPluginSettingsState<PluginSettings>,
  oldState: ReadonlyPluginSettingsState<PluginSettings>,
  context: unknown
) => Promisable<void>;

function createMockApp(): App {
  return strictProxy<App>({});
}

function createMockMailTmDomainManager(): MailTmDomainManager {
  return strictProxy<MailTmDomainManager>({});
}

function createMockPluginSettingsComponent(providerType: EmailProviderType = EmailProviderType.MailTm): CreateMockPluginSettingsComponentResult {
  let saveSettingsCallback: null | SaveSettingsCallback = null;

  const pluginSettingsComponent = strictProxy<PluginSettingsComponent>({
    on: vi.fn((_name: string, callback: (...args: unknown[]) => unknown) => {
      saveSettingsCallback = castTo<SaveSettingsCallback>(callback);
      return strictProxy<AsyncEventRef>({
        asyncEvents: {} as AsyncEventRef['asyncEvents'],
        callback: vi.fn()
      });
    }) as PluginSettingsComponent['on'],
    settings: {
      emailProviderType: providerType
    }
  });

  return {
    pluginSettingsComponent,
    triggerSaveSettings(newState: ReadonlyPluginSettingsState<PluginSettings>, oldState: ReadonlyPluginSettingsState<PluginSettings>): void {
      if (saveSettingsCallback) {
        saveSettingsCallback(newState, oldState, undefined);
      }
    }
  };
}

function createSettingsState(providerType: EmailProviderType): ReadonlyPluginSettingsState<PluginSettings> {
  return {
    effectiveValues: {
      emailProviderType: providerType
    },
    inputValues: {
      emailProviderType: providerType
    },
    validationMessages: {}
  } as ReadonlyPluginSettingsState<PluginSettings>;
}

describe('EmailProviderManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('onload', () => {
    it('should activate Mail.tm provider when settings have MailTm type', () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManager(createMockApp(), 'email-to-vault', pluginSettingsComponent, createMockMailTmDomainManager());

      manager.onload();

      expect(manager.getMailTmProvider()).not.toBeNull();
    });

    it('should throw for unimplemented ForwardEmail provider', () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.ForwardEmail);
      const manager = new EmailProviderManager(createMockApp(), 'email-to-vault', pluginSettingsComponent, createMockMailTmDomainManager());

      expect(() => {
        manager.onload();
      }).toThrow('Provider forward-email is not yet implemented');
    });

    it('should throw for unimplemented Imap provider', () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.Imap);
      const manager = new EmailProviderManager(createMockApp(), 'email-to-vault', pluginSettingsComponent, createMockMailTmDomainManager());

      expect(() => {
        manager.onload();
      }).toThrow('Provider imap is not yet implemented');
    });

    it('should register saveSettings event listener', () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManager(createMockApp(), 'email-to-vault', pluginSettingsComponent, createMockMailTmDomainManager());

      manager.onload();

      expect(pluginSettingsComponent.on).toHaveBeenCalledWith('saveSettings', expect.any(Function));
    });
  });

  describe('provider switching', () => {
    it('should swap provider when settings change', () => {
      const { pluginSettingsComponent, triggerSaveSettings } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManager(createMockApp(), 'email-to-vault', pluginSettingsComponent, createMockMailTmDomainManager());
      manager.onload();

      const firstProvider = manager.getMailTmProvider();
      expect(firstProvider).not.toBeNull();

      triggerSaveSettings(
        createSettingsState(EmailProviderType.MailTm),
        createSettingsState(EmailProviderType.ForwardEmail)
      );

      expect(manager.getMailTmProvider()).not.toBe(firstProvider);
    });

    it('should not swap provider when other settings change', () => {
      const { pluginSettingsComponent, triggerSaveSettings } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManager(createMockApp(), 'email-to-vault', pluginSettingsComponent, createMockMailTmDomainManager());
      manager.onload();

      const firstProvider = manager.getMailTmProvider();

      triggerSaveSettings(
        createSettingsState(EmailProviderType.MailTm),
        createSettingsState(EmailProviderType.MailTm)
      );

      expect(manager.getMailTmProvider()).toBe(firstProvider);
    });
  });

  describe('delegation', () => {
    it('should delegate deleteMessage to active provider', async () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManager(createMockApp(), 'email-to-vault', pluginSettingsComponent, createMockMailTmDomainManager());
      manager.onload();

      await manager.deleteMessage('msg-1');

      expect(mocks.mockMailTmProviderInstance?.['deleteMessage']).toHaveBeenCalledWith('msg-1');
    });

    it('should delegate downloadAttachment to active provider', async () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManager(createMockApp(), 'email-to-vault', pluginSettingsComponent, createMockMailTmDomainManager());
      manager.onload();

      await manager.downloadAttachment('msg-1', 'att-1');

      expect(mocks.mockMailTmProviderInstance?.['downloadAttachment']).toHaveBeenCalledWith('msg-1', 'att-1');
    });

    it('should delegate getMessage to active provider', async () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManager(createMockApp(), 'email-to-vault', pluginSettingsComponent, createMockMailTmDomainManager());
      manager.onload();

      await manager.getMessage('msg-1');

      expect(mocks.mockMailTmProviderInstance?.['getMessage']).toHaveBeenCalledWith('msg-1');
    });

    it('should delegate getMessages to active provider', async () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManager(createMockApp(), 'email-to-vault', pluginSettingsComponent, createMockMailTmDomainManager());
      manager.onload();

      await manager.getMessages();

      expect(mocks.mockMailTmProviderInstance?.['getMessages']).toHaveBeenCalledOnce();
    });

    it('should delegate markMessageAsSeen to active provider', async () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManager(createMockApp(), 'email-to-vault', pluginSettingsComponent, createMockMailTmDomainManager());
      manager.onload();

      await manager.markMessageAsSeen('msg-1');

      expect(mocks.mockMailTmProviderInstance?.['markMessageAsSeen']).toHaveBeenCalledWith('msg-1');
    });

    it('should throw when no active provider', async () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManager(createMockApp(), 'email-to-vault', pluginSettingsComponent, createMockMailTmDomainManager());

      await expect(manager.getMessages()).rejects.toThrow('No active email provider');
    });
  });

  describe('getMailTmProvider', () => {
    it('should return null when no provider is active', () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManager(createMockApp(), 'email-to-vault', pluginSettingsComponent, createMockMailTmDomainManager());

      expect(manager.getMailTmProvider()).toBeNull();
    });

    it('should return the MailTmProvider when active', () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManager(createMockApp(), 'email-to-vault', pluginSettingsComponent, createMockMailTmDomainManager());
      manager.onload();

      expect(manager.getMailTmProvider()).not.toBeNull();
    });
  });
});
