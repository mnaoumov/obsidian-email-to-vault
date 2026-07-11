import type {
  FetchMessageObject,
  MailboxLockObject,
  MessageAddressObject,
  MessageStructureObject
} from 'imapflow';
import type { App } from 'obsidian';

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

import type { PluginSettingsComponent } from '../../plugin-settings-component.ts';

import { ImapProviderDesktopComponent } from './imap-provider-desktop.ts';

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    Notice: vi.fn()
  };
});

const mocks = vi.hoisted(() => ({
  mockClientDefaults: {
    connect: vi.fn(async () => noopAsync()),
    download: vi.fn(async () => {
      await noopAsync();
      return {
        content: {
          [Symbol.asyncIterator](): AsyncIterableIterator<Buffer> {
            let isDone = false;
            return {
              async next(): Promise<IteratorResult<Buffer>> {
                await noopAsync();
                if (!isDone) {
                  isDone = true;
                  return { done: false, value: Buffer.from('attachment-data') };
                }
                return { done: true, value: undefined };
              },
              [Symbol.asyncIterator](): AsyncIterableIterator<Buffer> {
                return this;
              }
            };
          }
        },
        meta: { contentType: 'application/octet-stream', expectedSize: 0 }
      };
    }),
    fetch: vi.fn((): AsyncIterableIterator<FetchMessageObject> => {
      return {
        async next(): Promise<IteratorResult<FetchMessageObject>> {
          await noopAsync();
          return { done: true, value: undefined };
        },
        [Symbol.asyncIterator](): AsyncIterableIterator<FetchMessageObject> {
          return this;
        }
      };
    }),
    fetchOne: vi.fn(async (): Promise<false | FetchMessageObject> => {
      await noopAsync();
      return false;
    }),
    getMailboxLock: vi.fn(async () => {
      await noopAsync();
      return { path: 'INBOX', release: vi.fn() } satisfies MailboxLockObject;
    }),
    logout: vi.fn(async () => noopAsync()),
    messageDelete: vi.fn(async () => {
      await noopAsync();
      return true;
    }),
    messageFlagsAdd: vi.fn(async () => {
      await noopAsync();
      return true;
    })
  },
  mockLatestClient: null as null | Record<string, ReturnType<typeof vi.fn>>,
  mockSimpleParser: vi.fn()
}));

vi.mock('imapflow', () => {
  class MockImapFlow {
    public connect: ReturnType<typeof vi.fn>;
    public download: ReturnType<typeof vi.fn>;
    public fetch: ReturnType<typeof vi.fn>;
    public fetchOne: ReturnType<typeof vi.fn>;
    public getMailboxLock: ReturnType<typeof vi.fn>;
    public logout: ReturnType<typeof vi.fn>;
    public messageDelete: ReturnType<typeof vi.fn>;
    public messageFlagsAdd: ReturnType<typeof vi.fn>;

    public constructor() {
      this.connect = mocks.mockClientDefaults.connect;
      this.download = mocks.mockClientDefaults.download;
      this.fetch = mocks.mockClientDefaults.fetch;
      this.fetchOne = mocks.mockClientDefaults.fetchOne;
      this.getMailboxLock = mocks.mockClientDefaults.getMailboxLock;
      this.logout = mocks.mockClientDefaults.logout;
      this.messageDelete = mocks.mockClientDefaults.messageDelete;
      this.messageFlagsAdd = mocks.mockClientDefaults.messageFlagsAdd;
      mocks.mockLatestClient = castTo<Record<string, ReturnType<typeof vi.fn>>>(this);
    }
  }
  return { ImapFlow: MockImapFlow };
});

vi.mock('mailparser', () => ({
  simpleParser: mocks.mockSimpleParser
}));

interface MockPluginSettingsComponentOverrides {
  emailAddress?: string;
  emailPasswordSecretKey?: string;
  imapHost?: string;
  imapMailbox?: string;
  imapPort?: number;
  imapTls?: boolean;
}

function createAsyncIterable<T>(items: T[]): AsyncIterableIterator<T> {
  let index = 0;
  return {
    async next(): Promise<IteratorResult<T>> {
      await noopAsync();
      if (index < items.length) {
        const item = items[index];
        index++;
        return { done: false, value: item as T };
      }
      return { done: true, value: undefined };
    },
    [Symbol.asyncIterator](): AsyncIterableIterator<T> {
      return this;
    }
  };
}

function createMockApp(password: null | string = 'test-password'): App {
  return strictProxy<App>({
    secretStorage: {
      getSecret: vi.fn(() => password),
      setSecret: vi.fn()
    }
  });
}

function createMockPluginSettingsComponent(overrides?: MockPluginSettingsComponentOverrides): PluginSettingsComponent {
  return strictProxy<PluginSettingsComponent>({
    settings: {
      emailAddress: overrides?.emailAddress ?? 'user@example.com',
      emailPasswordSecretKey: overrides?.emailPasswordSecretKey ?? 'test-key',
      imapHost: overrides?.imapHost ?? 'imap.example.com',
      imapMailbox: overrides?.imapMailbox ?? 'INBOX',
      imapPort: overrides?.imapPort ?? 993,
      imapTls: overrides?.imapTls ?? true
    }
  });
}

function createSampleFetchMessage(overrides?: Partial<FetchMessageObject>): FetchMessageObject {
  return {
    bodyStructure: {
      childNodes: [
        { part: '1', type: 'text/plain' },
        { part: '2', type: 'text/html' }
      ],
      type: 'multipart/mixed'
    },
    envelope: {
      cc: [{ address: 'cc@example.com', name: 'CC' }],
      date: new Date('2026-01-15T10:00:00Z'),
      from: [{ address: 'sender@example.com', name: 'Sender' }],
      subject: 'Test Email',
      to: [{ address: 'recipient@example.com', name: 'Recipient' }]
    },
    seq: 1,
    uid: 42,
    ...overrides
  };
}

function createSampleFetchMessageWithAttachment(): FetchMessageObject {
  const bodyStructure: MessageStructureObject = {
    childNodes: [
      { part: '1', type: 'text/plain' },
      {
        disposition: 'attachment',
        dispositionParameters: { filename: 'test.pdf' },
        part: '2',
        type: 'application/pdf'
      }
    ],
    type: 'multipart/mixed'
  };
  return createSampleFetchMessage({ bodyStructure });
}

function createSampleFetchMessageWithoutBodyStructure(source?: Buffer): FetchMessageObject {
  const msg = createSampleFetchMessage();
  delete msg.bodyStructure;
  if (source) {
    msg.source = source;
  }
  return msg;
}

describe('ImapProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockLatestClient = null;
    mocks.mockSimpleParser.mockResolvedValue({
      html: '<p>Hello</p>',
      text: 'Hello'
    });
    mocks.mockClientDefaults.getMailboxLock.mockResolvedValue(
      {
        path: 'INBOX',
        release: vi.fn()
      } satisfies MailboxLockObject
    );
    mocks.mockClientDefaults.fetch.mockReturnValue({
      async next(): Promise<IteratorResult<FetchMessageObject>> {
        await noopAsync();
        return { done: true, value: undefined };
      },
      [Symbol.asyncIterator](): AsyncIterableIterator<FetchMessageObject> {
        return this;
      }
    });
    mocks.mockClientDefaults.fetchOne.mockResolvedValue(false);
  });

  describe('getMessages', () => {
    it('should return empty array when no messages', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());

      const result = await provider.getMessages();

      expect(result).toEqual([]);
    });

    it('should return mapped message summaries', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      const msg = createSampleFetchMessage();

      mocks.mockClientDefaults.fetch.mockReturnValue(createAsyncIterable([msg]));

      const result = await provider.getMessages();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        createdAt: '2026-01-15T10:00:00.000Z',
        from: { address: 'sender@example.com', name: 'Sender' },
        hasAttachments: false,
        id: '42',
        seen: false,
        subject: 'Test Email',
        to: [{ address: 'recipient@example.com', name: 'Recipient' }]
      });
    });

    it('should detect attachments in body structure', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      const msg = createSampleFetchMessageWithAttachment();

      mocks.mockClientDefaults.fetch.mockReturnValue(createAsyncIterable([msg]));

      const result = await provider.getMessages();

      expect(result[0]?.hasAttachments).toBe(true);
    });

    it('should detect seen flag', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      const msg = createSampleFetchMessage({ flags: new Set(['\\Seen']) });

      mocks.mockClientDefaults.fetch.mockReturnValue(createAsyncIterable([msg]));

      const result = await provider.getMessages();

      expect(result[0]?.seen).toBe(true);
    });

    it('should handle message with missing envelope fields', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      const msg = createSampleFetchMessage({
        envelope: {
          from: [{ address: '', name: '' }]
        }
      });

      mocks.mockClientDefaults.fetch.mockReturnValue(createAsyncIterable([msg]));

      const result = await provider.getMessages();

      expect(result[0]).toEqual({
        createdAt: '',
        from: { address: '', name: '' },
        hasAttachments: false,
        id: '42',
        seen: false,
        subject: '',
        to: []
      });
    });

    it('should fallback to empty strings when address fields are undefined', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      const msg = createSampleFetchMessage({
        envelope: {
          from: [castTo<MessageAddressObject>({})],
          to: [castTo<MessageAddressObject>({})]
        }
      });

      mocks.mockClientDefaults.fetch.mockReturnValue(createAsyncIterable([msg]));

      const result = await provider.getMessages();

      expect(result[0]?.from).toEqual({ address: '', name: '' });
      expect(result[0]?.to).toEqual([{ address: '', name: '' }]);
    });

    it('should handle messages without bodyStructure', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      const msg = createSampleFetchMessageWithoutBodyStructure();

      mocks.mockClientDefaults.fetch.mockReturnValue(createAsyncIterable([msg]));

      const result = await provider.getMessages();

      expect(result[0]?.hasAttachments).toBe(false);
    });

    it('should release lock even on error', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      const releaseFn = vi.fn();
      mocks.mockClientDefaults.getMailboxLock.mockResolvedValue({ path: 'INBOX', release: releaseFn });
      mocks.mockClientDefaults.fetch.mockImplementation(() => {
        throw new Error('Fetch failed');
      });

      await expect(provider.getMessages()).rejects.toThrow('Fetch failed');

      expect(releaseFn).toHaveBeenCalledOnce();
    });

    it('should logout even on error', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      mocks.mockClientDefaults.getMailboxLock.mockRejectedValue(new Error('Lock failed'));

      await expect(provider.getMessages()).rejects.toThrow('Lock failed');

      expect(mocks.mockLatestClient?.['logout']).toHaveBeenCalledOnce();
    });
  });

  describe('getMessage', () => {
    it('should fetch and parse a full message', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      const msg = createSampleFetchMessage({ source: Buffer.from('raw email') });
      mocks.mockClientDefaults.fetchOne.mockResolvedValue(msg);

      const result = await provider.getMessage('42');

      expect(result).toEqual({
        attachments: [],
        cc: [{ address: 'cc@example.com', name: 'CC' }],
        createdAt: '2026-01-15T10:00:00.000Z',
        from: { address: 'sender@example.com', name: 'Sender' },
        hasAttachments: false,
        html: ['<p>Hello</p>'],
        id: '42',
        seen: false,
        subject: 'Test Email',
        text: 'Hello',
        to: [{ address: 'recipient@example.com', name: 'Recipient' }]
      });
    });

    it('should throw when message not found', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      mocks.mockClientDefaults.fetchOne.mockResolvedValue(false);

      await expect(provider.getMessage('999')).rejects.toThrow('Message 999 not found');
    });

    it('should collect attachments from body structure', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      const msg = createSampleFetchMessageWithAttachment();
      msg.source = Buffer.from('raw');
      mocks.mockClientDefaults.fetchOne.mockResolvedValue(msg);

      const result = await provider.getMessage('42');

      expect(result.attachments).toEqual([{
        contentType: 'application/pdf',
        filename: 'test.pdf',
        id: '2'
      }]);
      expect(result.hasAttachments).toBe(true);
    });

    it('should handle message without bodyStructure', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      const msg = createSampleFetchMessageWithoutBodyStructure(Buffer.from('raw'));
      mocks.mockClientDefaults.fetchOne.mockResolvedValue(msg);

      const result = await provider.getMessage('42');

      expect(result.attachments).toEqual([]);
    });

    it('should use parameters name as filename fallback', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      const bodyStructure: MessageStructureObject = {
        childNodes: [
          {
            disposition: 'attachment',
            parameters: { name: 'fallback.txt' },
            part: '1',
            type: 'text/plain'
          }
        ],
        type: 'multipart/mixed'
      };
      const msg = createSampleFetchMessage({ bodyStructure, source: Buffer.from('raw') });
      mocks.mockClientDefaults.fetchOne.mockResolvedValue(msg);

      const result = await provider.getMessage('42');

      expect(result.attachments[0]?.filename).toBe('fallback.txt');
    });

    it('should use default attachment filename when no name provided', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      const bodyStructure: MessageStructureObject = {
        childNodes: [
          {
            disposition: 'attachment',
            part: '1',
            type: 'application/octet-stream'
          }
        ],
        type: 'multipart/mixed'
      };
      const msg = createSampleFetchMessage({ bodyStructure, source: Buffer.from('raw') });
      mocks.mockClientDefaults.fetchOne.mockResolvedValue(msg);

      const result = await provider.getMessage('42');

      expect(result.attachments[0]?.filename).toBe('attachment');
    });

    it('should handle message with missing source and envelope fields', async () => {
      mocks.mockSimpleParser.mockResolvedValue({ html: false, text: undefined });
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      const msg = createSampleFetchMessage({
        envelope: {
          from: [{ address: '', name: '' }]
        }
      });
      mocks.mockClientDefaults.fetchOne.mockResolvedValue(msg);

      const result = await provider.getMessage('42');

      expect(result.createdAt).toBe('');
      expect(result.from).toEqual({ address: '', name: '' });
      expect(result.seen).toBe(false);
      expect(result.subject).toBe('');
      expect(result.text).toBe('');
      expect(result.html).toEqual([]);
      expect(mocks.mockSimpleParser).toHaveBeenCalledWith(Buffer.alloc(0));
    });

    it('should handle empty html in parsed result', async () => {
      mocks.mockSimpleParser.mockResolvedValue({ html: false, text: 'Plain text' });
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());
      const msg = createSampleFetchMessage({ source: Buffer.from('raw') });
      mocks.mockClientDefaults.fetchOne.mockResolvedValue(msg);

      const result = await provider.getMessage('42');

      expect(result.html).toEqual([]);
      expect(result.text).toBe('Plain text');
    });
  });

  describe('downloadAttachment', () => {
    it('should download attachment content', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());

      const result = await provider.downloadAttachment({ attachmentId: '2', messageId: '42' });

      expect(mocks.mockLatestClient?.['download']).toHaveBeenCalledWith('42', '2', { uid: true });
      expect(new Uint8Array(result)).toEqual(new Uint8Array(Buffer.from('attachment-data')));
    });
  });

  describe('markMessageAsSeen', () => {
    it('should add \\Seen flag', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());

      await provider.markMessageAsSeen('42');

      expect(mocks.mockLatestClient?.['messageFlagsAdd']).toHaveBeenCalledWith('42', ['\\Seen'], { uid: true });
    });
  });

  describe('deleteMessage', () => {
    it('should delete message by UID', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent());

      await provider.deleteMessage('42');

      expect(mocks.mockLatestClient?.['messageDelete']).toHaveBeenCalledWith('42', { uid: true });
    });
  });

  describe('withConnection', () => {
    it('should throw when credentials are missing', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(null), createMockPluginSettingsComponent());

      await expect(provider.getMessages()).rejects.toThrow('Email address or password not configured');
    });

    it('should throw when email address is empty', async () => {
      const provider = new ImapProviderDesktopComponent(createMockApp(), createMockPluginSettingsComponent({ emailAddress: '' }));

      await expect(provider.getMessages()).rejects.toThrow('Email address or password not configured');
    });
  });
});
