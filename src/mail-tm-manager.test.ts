import { requestUrl } from 'obsidian';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { MailTmMessageFull } from './mail-tm-manager.ts';
import type { Plugin } from './plugin.ts';

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

interface MockPluginOverrides {
  emailAddress?: string;
  emailPasswordSecretKey?: string;
  manifestId?: string;
  secretStorageGetSecret?: (key: string) => null | string;
  secretStorageListSecrets?: () => string[];
  secretStorageSetSecret?: (key: string, value: string) => void;
  settingsManagerEditAndSave?: (cb: (settings: PluginSettings) => void) => Promise<void>;
}

function createMockPlugin(overrides?: MockPluginOverrides): Plugin {
  const settings = new PluginSettings();
  settings.emailAddress = overrides?.emailAddress ?? '';
  settings.emailPasswordSecretKey = overrides?.emailPasswordSecretKey ?? '';
  return strictProxy<Plugin>({
    app: {
      secretStorage: {
        getSecret: overrides?.secretStorageGetSecret ?? ((): null => null),
        listSecrets: overrides?.secretStorageListSecrets ?? ((): string[] => []),
        setSecret: overrides?.secretStorageSetSecret ?? vi.fn()
      }
    },
    manifest: {
      id: overrides?.manifestId ?? 'email-to-vault'
    },
    settings,
    settingsManager: {
      editAndSave: overrides?.settingsManagerEditAndSave ?? (async (cb: (s: PluginSettings) => void): Promise<void> => {
        cb(settings);
      })
    }
  });
}

describe('MailTmManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deleteMessage', () => {
    it('should send DELETE request with auth token', async () => {
      const plugin = createMockPlugin({
        emailAddress: 'me@mail.tm',
        emailPasswordSecretKey: 'secret-key',
        secretStorageGetSecret: () => 'password123'
      });
      const manager = new MailTmManager(plugin);

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
      const plugin = createMockPlugin({
        emailAddress: 'me@mail.tm',
        emailPasswordSecretKey: 'secret-key',
        secretStorageGetSecret: () => 'password123'
      });
      const manager = new MailTmManager(plugin);

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
      const plugin = createMockPlugin({
        emailAddress: 'me@mail.tm',
        emailPasswordSecretKey: 'secret-key',
        secretStorageGetSecret: () => 'password123'
      });
      const manager = new MailTmManager(plugin);

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

  describe('getNewEmailAddress', () => {
    it('should create account and save credentials', async () => {
      const setSecretFn = vi.fn();
      const editAndSaveFn = vi.fn(async (cb: (s: PluginSettings) => void): Promise<void> => {
        cb(new PluginSettings());
      });
      const plugin = createMockPlugin({
        secretStorageListSecrets: (): string[] => [],
        secretStorageSetSecret: setSecretFn,
        settingsManagerEditAndSave: editAndSaveFn
      });
      const manager = new MailTmManager(plugin);

      mockRequestUrl
        .mockResolvedValueOnce({
          json: { 'hydra:member': [{ domain: 'mail.tm', isActive: true }] }
        } as never)
        .mockResolvedValueOnce({
          status: 201
        } as never);

      await manager.registerRandomEmailAddress();

      expect(setSecretFn).toHaveBeenCalledOnce();
      expect(editAndSaveFn).toHaveBeenCalledOnce();
    });

    it('should throw when no active domains available', async () => {
      const plugin = createMockPlugin();
      const manager = new MailTmManager(plugin);

      mockRequestUrl.mockResolvedValueOnce({
        json: { 'hydra:member': [{ domain: 'mail.tm', isActive: false }] }
      } as never);

      await expect(manager.registerRandomEmailAddress()).rejects.toThrow('No active Mail.tm domains available');
    });

    it('should throw when account creation fails', async () => {
      const plugin = createMockPlugin();
      const manager = new MailTmManager(plugin);

      mockRequestUrl
        .mockResolvedValueOnce({
          json: { 'hydra:member': [{ domain: 'mail.tm', isActive: true }] }
        } as never)
        .mockResolvedValueOnce({
          status: 400
        } as never);

      await expect(manager.registerRandomEmailAddress()).rejects.toThrow('Failed to create Mail.tm account: 400');
    });
  });

  describe('unregisterEmailAddress', () => {
    it('should delete account, clear secret, and reset settings', async () => {
      const setSecretFn = vi.fn();
      const editAndSaveFn = vi.fn(async (cb: (s: PluginSettings) => void): Promise<void> => {
        cb(new PluginSettings());
      });
      const plugin = createMockPlugin({
        emailAddress: 'test@mail.tm',
        emailPasswordSecretKey: 'test-password-key',
        secretStorageGetSecret: () => 'password123',
        secretStorageSetSecret: setSecretFn,
        settingsManagerEditAndSave: editAndSaveFn
      });
      const manager = new MailTmManager(plugin);

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

      const plugin = createMockPlugin({
        emailAddress: 'me@mail.tm',
        emailPasswordSecretKey: 'secret-key',
        secretStorageGetSecret: () => 'password123'
      });
      const manager = new MailTmManager(plugin);

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
      const plugin = createMockPlugin({
        emailAddress: 'me@mail.tm',
        emailPasswordSecretKey: 'secret-key',
        secretStorageGetSecret: () => 'password123'
      });
      const manager = new MailTmManager(plugin);

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
      const plugin = createMockPlugin({
        emailAddress: '',
        emailPasswordSecretKey: ''
      });
      const manager = new MailTmManager(plugin);

      await expect(manager.getMessages()).rejects.toThrow('Email address or password not configured');
    });

    it('should throw when password secret is null', async () => {
      const plugin = createMockPlugin({
        emailAddress: 'me@mail.tm',
        emailPasswordSecretKey: 'key',
        secretStorageGetSecret: () => null
      });
      const manager = new MailTmManager(plugin);

      await expect(manager.getMessages()).rejects.toThrow('Email address or password not configured');
    });
  });

  describe('validateEmailDomain', () => {
    it('should return true for valid active domain', async () => {
      const plugin = createMockPlugin();
      const manager = new MailTmManager(plugin);

      mockRequestUrl.mockResolvedValueOnce({
        json: { 'hydra:member': [{ domain: 'mail.tm', isActive: true }] }
      } as never);

      const result = await manager.validateEmailDomain('user@mail.tm');

      expect(result).toBe(true);
    });

    it('should return false for inactive domain', async () => {
      const plugin = createMockPlugin();
      const manager = new MailTmManager(plugin);

      mockRequestUrl.mockResolvedValueOnce({
        json: { 'hydra:member': [{ domain: 'mail.tm', isActive: false }] }
      } as never);

      const result = await manager.validateEmailDomain('user@mail.tm');

      expect(result).toBe(false);
    });

    it('should return false for unknown domain', async () => {
      const plugin = createMockPlugin();
      const manager = new MailTmManager(plugin);

      mockRequestUrl.mockResolvedValueOnce({
        json: { 'hydra:member': [{ domain: 'mail.tm', isActive: true }] }
      } as never);

      const result = await manager.validateEmailDomain('user@other.com');

      expect(result).toBe(false);
    });

    it('should return false for address without domain', async () => {
      const plugin = createMockPlugin();
      const manager = new MailTmManager(plugin);

      const result = await manager.validateEmailDomain('nodomain');

      expect(result).toBe(false);
    });
  });
});
