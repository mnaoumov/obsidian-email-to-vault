import type { ImapFlowOptions } from 'imapflow';

import { noopAsync } from 'obsidian-dev-utils/function';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { buildWrapper } from './imapflow-desktop-wrapper.ts';

const mocks = vi.hoisted(() => ({
  mockImapFlow: {
    connect: vi.fn(async () => noopAsync()),
    download: vi.fn(async () => {
      await noopAsync();
      return { content: null, meta: { contentType: 'text/plain', expectedSize: 0 } };
    }),
    fetch: vi.fn(() => ({
      async next(): Promise<IteratorResult<unknown>> {
        await noopAsync();
        return { done: true, value: undefined };
      },
      [Symbol.asyncIterator](): AsyncIterableIterator<unknown> {
        return this;
      }
    })),
    fetchOne: vi.fn(async () => {
      await noopAsync();
      return false;
    }),
    getMailboxLock: vi.fn(async () => {
      await noopAsync();
      return { path: 'INBOX', release: vi.fn() };
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
  MockImapFlowConstructor: vi.fn()
}));

vi.mock('imapflow', () => {
  class MockImapFlow {
    public connect = mocks.mockImapFlow.connect;
    public download = mocks.mockImapFlow.download;
    public fetch = mocks.mockImapFlow.fetch;
    public fetchOne = mocks.mockImapFlow.fetchOne;
    public getMailboxLock = mocks.mockImapFlow.getMailboxLock;
    public logout = mocks.mockImapFlow.logout;
    public messageDelete = mocks.mockImapFlow.messageDelete;
    public messageFlagsAdd = mocks.mockImapFlow.messageFlagsAdd;

    public constructor(...args: unknown[]) {
      mocks.MockImapFlowConstructor(...args);
    }
  }
  return { ImapFlow: MockImapFlow };
});

const TEST_OPTIONS: ImapFlowOptions = {
  auth: {
    pass: 'password',
    user: 'user@example.com'
  },
  host: 'imap.example.com',
  logger: false,
  port: 993,
  secure: true
};

describe('imapflow-desktop-wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildWrapper', () => {
    it('should create an ImapFlow client with provided options', () => {
      buildWrapper(TEST_OPTIONS);

      expect(mocks.MockImapFlowConstructor).toHaveBeenCalledWith(TEST_OPTIONS);
    });

    it('should delegate connect to the ImapFlow client', async () => {
      const wrapper = buildWrapper(TEST_OPTIONS);

      await wrapper.connect();

      expect(mocks.mockImapFlow.connect).toHaveBeenCalledOnce();
    });

    it('should delegate logout to the ImapFlow client', async () => {
      const wrapper = buildWrapper(TEST_OPTIONS);

      await wrapper.logout();

      expect(mocks.mockImapFlow.logout).toHaveBeenCalledOnce();
    });

    it('should delegate getMailboxLock to the ImapFlow client', async () => {
      const wrapper = buildWrapper(TEST_OPTIONS);

      await wrapper.getMailboxLock('INBOX');

      expect(mocks.mockImapFlow.getMailboxLock).toHaveBeenCalledWith('INBOX');
    });

    it('should delegate messageDelete to the ImapFlow client', async () => {
      const wrapper = buildWrapper(TEST_OPTIONS);

      await wrapper.messageDelete('42', { uid: true });

      expect(mocks.mockImapFlow.messageDelete).toHaveBeenCalledWith('42', { uid: true });
    });

    it('should delegate messageFlagsAdd to the ImapFlow client', async () => {
      const wrapper = buildWrapper(TEST_OPTIONS);

      await wrapper.messageFlagsAdd('42', ['\\Seen'], { uid: true });

      expect(mocks.mockImapFlow.messageFlagsAdd).toHaveBeenCalledWith('42', ['\\Seen'], { uid: true });
    });

    it('should delegate download to the ImapFlow client', async () => {
      const wrapper = buildWrapper(TEST_OPTIONS);

      await wrapper.download('42', '2', { uid: true });

      expect(mocks.mockImapFlow.download).toHaveBeenCalledWith('42', '2', { uid: true });
    });

    it('should delegate fetchOne to the ImapFlow client', async () => {
      const wrapper = buildWrapper(TEST_OPTIONS);
      const query = { bodyStructure: true, envelope: true, flags: true, source: true };

      await wrapper.fetchOne('42', query, { uid: true });

      expect(mocks.mockImapFlow.fetchOne).toHaveBeenCalledWith('42', query, { uid: true });
    });

    it('should delegate fetch to the ImapFlow client', () => {
      const wrapper = buildWrapper(TEST_OPTIONS);
      const query = { bodyStructure: true, envelope: true, flags: true, uid: true };

      wrapper.fetch('1:*', query);

      expect(mocks.mockImapFlow.fetch).toHaveBeenCalledWith('1:*', query);
    });
  });
});
