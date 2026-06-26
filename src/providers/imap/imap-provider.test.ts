import type { App } from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { Platform } from 'obsidian';
import { noopAsync } from 'obsidian-dev-utils/function';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from '../../plugin-settings-component.ts';
import type {
  EmailMessageFull,
  EmailMessageSummary
} from '../email-provider-types.ts';
import type { EmailProvider } from '../email-provider.ts';

import { ImapProviderComponent } from './imap-provider.ts';

const mocks = vi.hoisted(() => ({
  mockDesktopProvider: {
    deleteMessage: vi.fn(async () => noopAsync()),
    downloadAttachment: vi.fn(async () => {
      await noopAsync();
      return new ArrayBuffer(0);
    }),
    getMessage: vi.fn(async (): Promise<EmailMessageFull> => {
      await noopAsync();
      return {
        attachments: [],
        cc: [],
        createdAt: '',
        from: { address: '', name: '' },
        hasAttachments: false,
        html: [],
        id: '1',
        seen: false,
        subject: 'Desktop Message',
        text: '',
        to: []
      };
    }),
    getMessages: vi.fn(async (): Promise<EmailMessageSummary[]> => {
      await noopAsync();
      return [];
    }),
    markMessageAsSeen: vi.fn(async () => noopAsync())
  } satisfies EmailProvider,
  mockMobileProvider: {
    deleteMessage: vi.fn(async () => noopAsync()),
    downloadAttachment: vi.fn(async () => {
      await noopAsync();
      return new ArrayBuffer(0);
    }),
    getMessage: vi.fn(async (): Promise<EmailMessageFull> => {
      await noopAsync();
      return {
        attachments: [],
        cc: [],
        createdAt: '',
        from: { address: '', name: '' },
        hasAttachments: false,
        html: [],
        id: '1',
        seen: false,
        subject: 'Mobile Message',
        text: '',
        to: []
      };
    }),
    getMessages: vi.fn(async (): Promise<EmailMessageSummary[]> => {
      await noopAsync();
      return [];
    }),
    markMessageAsSeen: vi.fn(async () => noopAsync())
  } satisfies EmailProvider
}));

vi.mock('./imap-provider-desktop.ts', () => {
  return {
    ImapProviderDesktopComponent: class MockImapProviderDesktopComponent {
      public deleteMessage = mocks.mockDesktopProvider.deleteMessage;
      public downloadAttachment = mocks.mockDesktopProvider.downloadAttachment;
      public getMessage = mocks.mockDesktopProvider.getMessage;
      public getMessages = mocks.mockDesktopProvider.getMessages;
      public markMessageAsSeen = mocks.mockDesktopProvider.markMessageAsSeen;
    }
  };
});

vi.mock('./imap-provider-mobile.ts', () => {
  return {
    ImapProviderMobileComponent: class MockImapProviderMobileComponent {
      public deleteMessage = mocks.mockMobileProvider.deleteMessage;
      public downloadAttachment = mocks.mockMobileProvider.downloadAttachment;
      public getMessage = mocks.mockMobileProvider.getMessage;
      public getMessages = mocks.mockMobileProvider.getMessages;
      public markMessageAsSeen = mocks.mockMobileProvider.markMessageAsSeen;
    }
  };
});

function createMockApp(): App {
  return strictProxy<App>({});
}

function createMockPluginSettingsComponent(): PluginSettingsComponent {
  return strictProxy<PluginSettingsComponent>({});
}

describe('ImapProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(Platform, 'isDesktop', { value: true, writable: true });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'isDesktop', { value: true, writable: true });
  });

  describe('onload', () => {
    it('should create desktop provider when on desktop', async () => {
      const provider = new ImapProviderComponent({
        app: createMockApp(),
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({}),
        pluginSettingsComponent: createMockPluginSettingsComponent()
      });

      await provider.loadWithPromises();
      const result = await provider.getMessages();

      expect(result).toEqual([]);
      expect(mocks.mockDesktopProvider.getMessages).toHaveBeenCalledOnce();
    });

    it('should create mobile provider when on mobile', async () => {
      Object.defineProperty(Platform, 'isDesktop', { value: false, writable: true });

      const provider = new ImapProviderComponent({
        app: createMockApp(),
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({}),
        pluginSettingsComponent: createMockPluginSettingsComponent()
      });

      await provider.loadWithPromises();
      const result = await provider.getMessages();

      expect(result).toEqual([]);
      expect(mocks.mockMobileProvider.getMessages).toHaveBeenCalledOnce();
    });
  });

  describe('delegation', () => {
    it('should delegate getMessages to platform provider', async () => {
      const provider = new ImapProviderComponent({
        app: createMockApp(),
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({}),
        pluginSettingsComponent: createMockPluginSettingsComponent()
      });
      await provider.loadWithPromises();

      await provider.getMessages();

      expect(mocks.mockDesktopProvider.getMessages).toHaveBeenCalledOnce();
    });

    it('should delegate getMessage to platform provider', async () => {
      const provider = new ImapProviderComponent({
        app: createMockApp(),
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({}),
        pluginSettingsComponent: createMockPluginSettingsComponent()
      });
      await provider.loadWithPromises();

      await provider.getMessage('42');

      expect(mocks.mockDesktopProvider.getMessage).toHaveBeenCalledWith('42');
    });

    it('should delegate downloadAttachment to platform provider', async () => {
      const provider = new ImapProviderComponent({
        app: createMockApp(),
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({}),
        pluginSettingsComponent: createMockPluginSettingsComponent()
      });
      await provider.loadWithPromises();

      await provider.downloadAttachment('42', '2');

      expect(mocks.mockDesktopProvider.downloadAttachment).toHaveBeenCalledWith('42', '2');
    });

    it('should delegate markMessageAsSeen to platform provider', async () => {
      const provider = new ImapProviderComponent({
        app: createMockApp(),
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({}),
        pluginSettingsComponent: createMockPluginSettingsComponent()
      });
      await provider.loadWithPromises();

      await provider.markMessageAsSeen('42');

      expect(mocks.mockDesktopProvider.markMessageAsSeen).toHaveBeenCalledWith('42');
    });

    it('should delegate deleteMessage to platform provider', async () => {
      const provider = new ImapProviderComponent({
        app: createMockApp(),
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({}),
        pluginSettingsComponent: createMockPluginSettingsComponent()
      });
      await provider.loadWithPromises();

      await provider.deleteMessage('42');

      expect(mocks.mockDesktopProvider.deleteMessage).toHaveBeenCalledWith('42');
    });
  });

  describe('before onload', () => {
    it('should throw when accessing platform provider before onload', async () => {
      const provider = new ImapProviderComponent({
        app: createMockApp(),
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({}),
        pluginSettingsComponent: createMockPluginSettingsComponent()
      });

      await expect(provider.getMessages()).rejects.toThrow();
    });
  });
});
