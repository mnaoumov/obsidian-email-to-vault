import type { App } from 'obsidian';

import { requestUrl } from 'obsidian';
import { noopAsync } from 'obsidian-dev-utils/function';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { MailTmDomainManager } from './mail-tm-domain-manager.ts';
import type { MailTmMessageFull } from './mail-tm-manager.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { MailTmManager } from './mail-tm-manager.ts';
import { PluginSettings } from './plugin-settings.ts';

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    Notice: vi.fn(),
    requestUrl: vi.fn()
  };
});

const mockRequestUrl = vi.mocked(requestUrl);

interface MockParams {
  emailAddress?: string;
  emailPasswordSecretKey?: string;
  getAvailableDomain?: () => Promise<string>;
  pluginId?: string;
  secretStorageGetSecret?: (key: string) => null | string;
  secretStorageSetSecret?: (key: string, value: string) => void;
  settingsComponentEditAndSave?: (cb: (settings: PluginSettings) => void) => Promise<void>;
}

interface MockResult {
  app: App;
  mailTmDomainManager: MailTmDomainManager;
  pluginSettingsComponent: PluginSettingsComponent;
}

function createManager(overrides?: MockParams): MailTmManager {
  const { app, mailTmDomainManager, pluginSettingsComponent } = createMocks(overrides);
  return new MailTmManager(app, overrides?.pluginId ?? 'email-to-vault', pluginSettingsComponent, mailTmDomainManager);
}

function createMocks(overrides?: MockParams): MockResult {
  const settings = new PluginSettings();
  settings.emailAddress = overrides?.emailAddress ?? '';
  settings.emailPasswordSecretKey = overrides?.emailPasswordSecretKey ?? '';

  const app = strictProxy<App>({
    secretStorage: {
      getSecret: overrides?.secretStorageGetSecret ?? ((): null => null),
      setSecret: overrides?.secretStorageSetSecret ?? vi.fn()
    }
  });

  const pluginSettingsComponent = strictProxy<PluginSettingsComponent>({
    editAndSave: overrides?.settingsComponentEditAndSave ?? (async (cb: (s: PluginSettings) => void): Promise<void> => {
      await noopAsync();
      cb(settings);
    }),
    settings
  });

  const mailTmDomainManager = strictProxy<MailTmDomainManager>({
    getAvailableDomain: overrides?.getAvailableDomain ?? vi.fn(async () => {
      await noopAsync();
      return 'mail.tm';
    })
  });

  return { app, mailTmDomainManager, pluginSettingsComponent };
}

describe('MailTmManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deleteMessage', () => {
    it('should send DELETE request with auth token', async () => {
      const manager = createManager({
        emailAddress: 'me@mail.tm',
        emailPasswordSecretKey: 'secret-key',
        secretStorageGetSecret: () => 'password123'
      });

      mockRequestUrl
        .mockResolvedValueOnce({
          json: { token: 'jwt-token' }
        } as never)
        .mockResolvedValueOnce({} as never);

      await manager.deleteMessage('msg-to-delete');

      expect(mockRequestUrl).toHaveBeenCalledWith({
        headers: { Authorization: 'Bearer jwt-token' },
        method: 'DELETE',
        url: 'https://api.mail.tm/messages/msg-to-delete'
      });
    });
  });

  describe('downloadAttachment', () => {
    it('should fetch attachment with auth token', async () => {
      const manager = createManager({
        emailAddress: 'me@mail.tm',
        emailPasswordSecretKey: 'secret-key',
        secretStorageGetSecret: () => 'password123'
      });

      const mockArrayBuffer = new ArrayBuffer(8);
      mockRequestUrl
        .mockResolvedValueOnce({
          json: { token: 'jwt-token' }
        } as never)
        .mockResolvedValueOnce({
          arrayBuffer: mockArrayBuffer
        } as never);

      const result = await manager.downloadAttachment('msg1', 'att1');

      expect(result).toBe(mockArrayBuffer);
      expect(mockRequestUrl).toHaveBeenCalledWith({
        headers: { Authorization: 'Bearer jwt-token' },
        method: 'GET',
        url: 'https://api.mail.tm/messages/msg1/attachment/att1'
      });
    });
  });

  describe('markMessageAsSeen', () => {
    it('should send PATCH request with seen: true', async () => {
      const manager = createManager({
        emailAddress: 'me@mail.tm',
        emailPasswordSecretKey: 'secret-key',
        secretStorageGetSecret: () => 'password123'
      });

      mockRequestUrl
        .mockResolvedValueOnce({
          json: { token: 'jwt-token' }
        } as never)
        .mockResolvedValueOnce({} as never);

      await manager.markMessageAsSeen('msg1');

      expect(mockRequestUrl).toHaveBeenCalledWith({
        body: JSON.stringify({ seen: true }),
        contentType: 'application/merge-patch+json',
        headers: { Authorization: 'Bearer jwt-token' },
        method: 'PATCH',
        url: 'https://api.mail.tm/messages/msg1'
      });
    });
  });

  describe('registerRandomEmailAddress', () => {
    it('should create account and save credentials', async () => {
      const setSecretFn = vi.fn();
      const editAndSaveFn = vi.fn(async (cb: (s: PluginSettings) => void): Promise<void> => {
        await noopAsync();
        cb(new PluginSettings());
      });
      const manager = createManager({
        secretStorageSetSecret: setSecretFn,
        settingsComponentEditAndSave: editAndSaveFn
      });

      mockRequestUrl.mockResolvedValueOnce({
        status: 201
      } as never);

      await manager.registerRandomEmailAddress();

      expect(setSecretFn).toHaveBeenCalledOnce();
      expect(editAndSaveFn).toHaveBeenCalledOnce();
    });

    it('should throw when no active domains available', async () => {
      const manager = createManager({
        getAvailableDomain: vi.fn(async () => {
          await noopAsync();
          throw new Error('No active Mail.tm domains available');
        })
      });

      await expect(manager.registerRandomEmailAddress()).rejects.toThrow('No active Mail.tm domains available');
    });

    it('should throw when account creation fails', async () => {
      const manager = createManager();

      mockRequestUrl.mockResolvedValueOnce({
        status: 400
      } as never);

      await expect(manager.registerRandomEmailAddress()).rejects.toThrow('Failed to create Mail.tm account: 400');
    });
  });

  describe('unregisterEmailAddress', () => {
    it('should delete account without clearing secret when key is empty', async () => {
      const setSecretFn = vi.fn();
      const editAndSaveFn = vi.fn(async (cb: (s: PluginSettings) => void): Promise<void> => {
        await noopAsync();
        cb(new PluginSettings());
      });
      const manager = createManager({
        emailAddress: 'test@mail.tm',
        emailPasswordSecretKey: '',
        secretStorageGetSecret: () => 'password123',
        secretStorageSetSecret: setSecretFn,
        settingsComponentEditAndSave: editAndSaveFn
      });

      const TEST_JWT = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ id: 'account-uuid-456' }))}.sig`;
      mockRequestUrl
        .mockResolvedValueOnce({
          json: { token: TEST_JWT }
        } as never)
        .mockResolvedValueOnce({} as never);

      await manager.unregisterEmailAddress();

      expect(setSecretFn).not.toHaveBeenCalled();
      expect(editAndSaveFn).toHaveBeenCalledOnce();
    });

    it('should delete account, clear secret, and reset settings', async () => {
      const setSecretFn = vi.fn();
      const editAndSaveFn = vi.fn(async (cb: (s: PluginSettings) => void): Promise<void> => {
        await noopAsync();
        cb(new PluginSettings());
      });
      const manager = createManager({
        emailAddress: 'test@mail.tm',
        emailPasswordSecretKey: 'test-password-key',
        secretStorageGetSecret: () => 'password123',
        secretStorageSetSecret: setSecretFn,
        settingsComponentEditAndSave: editAndSaveFn
      });

      const TEST_JWT = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ id: 'account-uuid-123' }))}.sig`;
      mockRequestUrl
        .mockResolvedValueOnce({
          json: { token: TEST_JWT }
        } as never)
        .mockResolvedValueOnce({} as never);

      await manager.unregisterEmailAddress();

      expect(mockRequestUrl).toHaveBeenCalledWith(expect.objectContaining({
        method: 'DELETE',
        url: 'https://api.mail.tm/accounts/account-uuid-123'
      }));
      expect(setSecretFn).toHaveBeenCalledWith('test-password-key', '');
      expect(editAndSaveFn).toHaveBeenCalledOnce();
    });
  });

  describe('getMessage', () => {
    it('should fetch a single message with auth token', async () => {
      const mockMessage: MailTmMessageFull = {
        attachments: [],
        cc: [],
        createdAt: '2026-01-01T00:00:00+00:00',
        downloadUrl: '/messages/abc123/download',
        from: { address: 'sender@example.com', name: 'Sender' },
        hasAttachments: false,
        html: ['<p>Hello</p>'],
        id: 'abc123',
        seen: false,
        size: 100,
        subject: 'Test Subject',
        text: 'Hello',
        to: [{ address: 'me@mail.tm', name: '' }],
        updatedAt: '2026-01-01T00:00:00+00:00'
      };

      const manager = createManager({
        emailAddress: 'me@mail.tm',
        emailPasswordSecretKey: 'secret-key',
        secretStorageGetSecret: () => 'password123'
      });

      mockRequestUrl
        .mockResolvedValueOnce({
          json: { token: 'jwt-token' }
        } as never)
        .mockResolvedValueOnce({
          json: mockMessage
        } as never);

      const result = await manager.getMessage('abc123');

      expect(result).toEqual(mockMessage);
    });
  });

  describe('getMessages', () => {
    it('should fetch message list with auth token', async () => {
      const manager = createManager({
        emailAddress: 'me@mail.tm',
        emailPasswordSecretKey: 'secret-key',
        secretStorageGetSecret: () => 'password123'
      });

      const messages = [
        {
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'a@b.com', name: '' },
          hasAttachments: false,
          id: '1',
          seen: false,
          size: 0,
          subject: 'Test',
          to: [],
          updatedAt: ''
        }
      ];

      mockRequestUrl
        .mockResolvedValueOnce({
          json: { token: 'jwt-token' }
        } as never)
        .mockResolvedValueOnce({
          json: { 'hydra:member': messages }
        } as never);

      const result = await manager.getMessages();

      expect(result).toEqual(messages);
    });

    it('should throw when credentials are missing', async () => {
      const manager = createManager({
        emailAddress: '',
        emailPasswordSecretKey: ''
      });

      await expect(manager.getMessages()).rejects.toThrow('Email address or password not configured');
    });

    it('should throw when password secret is null', async () => {
      const manager = createManager({
        emailAddress: 'me@mail.tm',
        emailPasswordSecretKey: 'key',
        secretStorageGetSecret: () => null
      });

      await expect(manager.getMessages()).rejects.toThrow('Email address or password not configured');
    });
  });
});
