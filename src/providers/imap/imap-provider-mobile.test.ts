import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';

import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { ImapProviderMobileComponent } from './imap-provider-mobile.ts';

vi.mock('@mnaoumov/typescript-lib/function', async (importOriginal) => {
  const original = await importOriginal<typeof import('@mnaoumov/typescript-lib/function')>();
  return {
    ...original,
    noopAsync: vi.fn(original.noopAsync)
  };
});

const mockShowNotice = vi.fn();

describe('ImapProviderMobile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMessages', () => {
    it('should return empty array', async () => {
      const provider = new ImapProviderMobileComponent(strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }));

      const result = await provider.getMessages();

      expect(result).toEqual([]);
    });

    it('should show notice', async () => {
      const provider = new ImapProviderMobileComponent(strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }));

      await provider.getMessages();

      expect(mockShowNotice).toHaveBeenCalledWith('IMAP is not available on mobile devices');
    });

    it('should call noopAsync', async () => {
      const provider = new ImapProviderMobileComponent(strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }));

      await provider.getMessages();

      expect(noopAsync).toHaveBeenCalledOnce();
    });
  });

  describe('getMessage', () => {
    it('should return empty message with given id', async () => {
      const provider = new ImapProviderMobileComponent(strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }));

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
      const provider = new ImapProviderMobileComponent(strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }));

      await provider.getMessage('42');

      expect(mockShowNotice).toHaveBeenCalledWith('IMAP is not available on mobile devices');
    });
  });

  describe('downloadAttachment', () => {
    it('should return empty ArrayBuffer', async () => {
      const provider = new ImapProviderMobileComponent(strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }));

      const result = await provider.downloadAttachment();

      expect(result.byteLength).toBe(0);
    });

    it('should show notice', async () => {
      const provider = new ImapProviderMobileComponent(strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }));

      await provider.downloadAttachment();

      expect(mockShowNotice).toHaveBeenCalledWith('IMAP is not available on mobile devices');
    });
  });

  describe('markMessageAsSeen', () => {
    it('should show notice', async () => {
      const provider = new ImapProviderMobileComponent(strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }));

      await provider.markMessageAsSeen();

      expect(mockShowNotice).toHaveBeenCalledWith('IMAP is not available on mobile devices');
    });

    it('should call noopAsync', async () => {
      const provider = new ImapProviderMobileComponent(strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }));

      await provider.markMessageAsSeen();

      expect(noopAsync).toHaveBeenCalledOnce();
    });
  });

  describe('deleteMessage', () => {
    it('should show notice', async () => {
      const provider = new ImapProviderMobileComponent(strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }));

      await provider.deleteMessage();

      expect(mockShowNotice).toHaveBeenCalledWith('IMAP is not available on mobile devices');
    });

    it('should call noopAsync', async () => {
      const provider = new ImapProviderMobileComponent(strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }));

      await provider.deleteMessage();

      expect(noopAsync).toHaveBeenCalledOnce();
    });
  });
});
