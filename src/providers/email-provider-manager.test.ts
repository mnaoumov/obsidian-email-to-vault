import type { App } from 'obsidian';
import type { AsyncEventRef } from 'obsidian-dev-utils/async-events';
import type { ReadonlyPluginSettingsState } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';
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

import { EmailProviderManagerComponent } from './email-provider-manager.ts';
import { EmailProviderType } from './email-provider-type.ts';

interface ObsidianComponentModule {
  Component: new () => object;
}

const mocks = vi.hoisted(() => ({
  mockMailTmProviderInstance: null as null | Record<string, ReturnType<typeof vi.fn>>
}));

vi.mock('./mail-tm/mail-tm-provider.ts', async () => {
  const { Component } = await vi.importActual<ObsidianComponentModule>('obsidian');
  class MockMailTmProviderComponent extends Component {
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
      super();
      mocks.mockMailTmProviderInstance = castTo<Record<string, ReturnType<typeof vi.fn>>>(this);
    }
  }
  return { MailTmProviderComponent: MockMailTmProviderComponent };
});

vi.mock('./imap/imap-provider.ts', async () => {
  const { Component } = await vi.importActual<ObsidianComponentModule>('obsidian');
  class MockImapProviderComponent extends Component {
    public readonly isImap = true;
  }
  return { ImapProviderComponent: MockImapProviderComponent };
});

interface CreateMockPluginSettingsComponentResult {
  readonly pluginSettingsComponent: PluginSettingsComponent;
  triggerSaveSettings(newState: ReadonlyPluginSettingsState<PluginSettings>, oldState: ReadonlyPluginSettingsState<PluginSettings>): Promise<void>;
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
        asyncEventSource: {},
        callback: vi.fn()
      });
    }) as PluginSettingsComponent['on'],
    settings: {
      emailProviderType: providerType
    }
  });

  return {
    pluginSettingsComponent,
    async triggerSaveSettings(newState: ReadonlyPluginSettingsState<PluginSettings>, oldState: ReadonlyPluginSettingsState<PluginSettings>): Promise<void> {
      if (saveSettingsCallback) {
        await saveSettingsCallback(newState, oldState, undefined);
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
      const manager = new EmailProviderManagerComponent({
        app: createMockApp(),
        mailTmDomainManager: createMockMailTmDomainManager(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });

      manager.load();

      expect(manager.getMailTmProvider()).not.toBeNull();
    });

    it('should activate IMAP provider when settings have Imap type', () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.Imap);
      const manager = new EmailProviderManagerComponent({
        app: createMockApp(),
        mailTmDomainManager: createMockMailTmDomainManager(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });

      manager.load();

      expect(manager.getMailTmProvider()).toBeNull();
    });

    it('should register saveSettings event listener', () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManagerComponent({
        app: createMockApp(),
        mailTmDomainManager: createMockMailTmDomainManager(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });

      manager.load();

      expect(pluginSettingsComponent.on).toHaveBeenCalledWith('saveSettings', expect.any(Function));
    });
  });

  describe('provider switching', () => {
    it('should swap provider when settings change', async () => {
      const { pluginSettingsComponent, triggerSaveSettings } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManagerComponent({
        app: createMockApp(),
        mailTmDomainManager: createMockMailTmDomainManager(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      manager.load();

      const firstProvider = manager.getMailTmProvider();
      expect(firstProvider).not.toBeNull();

      await triggerSaveSettings(
        createSettingsState(EmailProviderType.MailTm),
        createSettingsState(EmailProviderType.Imap)
      );

      expect(manager.getMailTmProvider()).not.toBe(firstProvider);
    });

    it('should not swap provider when other settings change', async () => {
      const { pluginSettingsComponent, triggerSaveSettings } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManagerComponent({
        app: createMockApp(),
        mailTmDomainManager: createMockMailTmDomainManager(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      manager.load();

      const firstProvider = manager.getMailTmProvider();

      await triggerSaveSettings(
        createSettingsState(EmailProviderType.MailTm),
        createSettingsState(EmailProviderType.MailTm)
      );

      expect(manager.getMailTmProvider()).toBe(firstProvider);
    });
  });

  describe('delegation', () => {
    it('should delegate deleteMessage to active provider', async () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManagerComponent({
        app: createMockApp(),
        mailTmDomainManager: createMockMailTmDomainManager(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      manager.load();

      await manager.deleteMessage('msg-1');

      expect(mocks.mockMailTmProviderInstance?.['deleteMessage']).toHaveBeenCalledWith('msg-1');
    });

    it('should delegate downloadAttachment to active provider', async () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManagerComponent({
        app: createMockApp(),
        mailTmDomainManager: createMockMailTmDomainManager(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      manager.load();

      await manager.downloadAttachment('msg-1', 'att-1');

      expect(mocks.mockMailTmProviderInstance?.['downloadAttachment']).toHaveBeenCalledWith('msg-1', 'att-1');
    });

    it('should delegate getMessage to active provider', async () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManagerComponent({
        app: createMockApp(),
        mailTmDomainManager: createMockMailTmDomainManager(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      manager.load();

      await manager.getMessage('msg-1');

      expect(mocks.mockMailTmProviderInstance?.['getMessage']).toHaveBeenCalledWith('msg-1');
    });

    it('should delegate getMessages to active provider', async () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManagerComponent({
        app: createMockApp(),
        mailTmDomainManager: createMockMailTmDomainManager(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      manager.load();

      await manager.getMessages();

      expect(mocks.mockMailTmProviderInstance?.['getMessages']).toHaveBeenCalledOnce();
    });

    it('should delegate markMessageAsSeen to active provider', async () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManagerComponent({
        app: createMockApp(),
        mailTmDomainManager: createMockMailTmDomainManager(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      manager.load();

      await manager.markMessageAsSeen('msg-1');

      expect(mocks.mockMailTmProviderInstance?.['markMessageAsSeen']).toHaveBeenCalledWith('msg-1');
    });

    it('should throw when no active provider', async () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManagerComponent({
        app: createMockApp(),
        mailTmDomainManager: createMockMailTmDomainManager(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });

      await expect(manager.getMessages()).rejects.toThrow('No active email provider');
    });
  });

  describe('getMailTmProvider', () => {
    it('should return null when no provider is active', () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManagerComponent({
        app: createMockApp(),
        mailTmDomainManager: createMockMailTmDomainManager(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });

      expect(manager.getMailTmProvider()).toBeNull();
    });

    it('should return the MailTmProvider when active', () => {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent(EmailProviderType.MailTm);
      const manager = new EmailProviderManagerComponent({
        app: createMockApp(),
        mailTmDomainManager: createMockMailTmDomainManager(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      manager.load();

      expect(manager.getMailTmProvider()).not.toBeNull();
    });
  });
});
