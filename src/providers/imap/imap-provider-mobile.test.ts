import { Notice } from 'obsidian';
import {
  noop,
  noopAsync
} from 'obsidian-dev-utils/function';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { ImapProviderMobileComponent } from './imap-provider-mobile.ts';

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    Component: class MockComponent {
      public onload(): void {
        noop();
      }
    },
    Notice: vi.fn()
  };
});

vi.mock('obsidian-dev-utils/function', () => ({
  noop: vi.fn(),
  noopAsync: vi.fn(() => noopAsync())
}));

describe('ImapProviderMobile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMessages', () => {
    it('should return empty array', async () => {
      const provider = new ImapProviderMobileComponent();

      const result = await provider.getMessages();

      expect(result).toEqual([]);
    });

    it('should show notice', async () => {
      const provider = new ImapProviderMobileComponent();

      await provider.getMessages();

      expect(Notice).toHaveBeenCalledWith('IMAP is not available on mobile devices');
    });

    it('should call noopAsync', async () => {
      const provider = new ImapProviderMobileComponent();

      await provider.getMessages();

      expect(noopAsync).toHaveBeenCalledOnce();
    });
  });

  describe('getMessage', () => {
    it('should return empty message with given id', async () => {
      const provider = new ImapProviderMobileComponent();

      const result = await provider.getMessage('42');

      expect(result).toEqual({
        attachments: [],
        cc: [],
        createdAt: '',
        from: { address: '', name: '' },
        hasAttachments: false,
        html: [],
        id: '42',
        seen: false,
        subject: '',
        text: '',
        to: []
      });
    });

    it('should show notice', async () => {
      const provider = new ImapProviderMobileComponent();

      await provider.getMessage('42');

      expect(Notice).toHaveBeenCalledWith('IMAP is not available on mobile devices');
    });
  });

  describe('downloadAttachment', () => {
    it('should return empty ArrayBuffer', async () => {
      const provider = new ImapProviderMobileComponent();

      const result = await provider.downloadAttachment();

      expect(result.byteLength).toBe(0);
    });

    it('should show notice', async () => {
      const provider = new ImapProviderMobileComponent();

      await provider.downloadAttachment();

      expect(Notice).toHaveBeenCalledWith('IMAP is not available on mobile devices');
    });
  });

  describe('markMessageAsSeen', () => {
    it('should show notice', async () => {
      const provider = new ImapProviderMobileComponent();

      await provider.markMessageAsSeen();

      expect(Notice).toHaveBeenCalledWith('IMAP is not available on mobile devices');
    });

    it('should call noopAsync', async () => {
      const provider = new ImapProviderMobileComponent();

      await provider.markMessageAsSeen();

      expect(noopAsync).toHaveBeenCalledOnce();
    });
  });

  describe('deleteMessage', () => {
    it('should show notice', async () => {
      const provider = new ImapProviderMobileComponent();

      await provider.deleteMessage();

      expect(Notice).toHaveBeenCalledWith('IMAP is not available on mobile devices');
    });

    it('should call noopAsync', async () => {
      const provider = new ImapProviderMobileComponent();

      await provider.deleteMessage();

      expect(noopAsync).toHaveBeenCalledOnce();
    });
  });
});
