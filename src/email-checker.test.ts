import { Notice } from 'obsidian';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { EmailNoteCreator } from './email-note-creator.ts';
import type { MailTmManager } from './mail-tm-manager.ts';
import type { Plugin } from './plugin.ts';

import { EmailChecker } from './email-checker.ts';

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    Notice: vi.fn()
  };
});

const mockNotice = vi.mocked(Notice);

vi.stubGlobal('activeWindow', { setInterval: vi.fn(() => 0) });

interface MockMailTmManagerOverrides {
  deleteMessage?: MailTmManager['deleteMessage'];
  getMessages?: MailTmManager['getMessages'];
  markMessageAsSeen?: MailTmManager['markMessageAsSeen'];
}

interface MockPluginOverrides {
  emailAddress?: string;
  emailCheckIntervalInMinutes?: number;
  shouldDeleteSeenEmails?: boolean;
}

function createMockMailTmManager(overrides?: MockMailTmManagerOverrides): MailTmManager {
  return strictProxy<MailTmManager>({
    deleteMessage: overrides?.deleteMessage ?? vi.fn(),
    getMessages: overrides?.getMessages ?? vi.fn(async () => []),
    markMessageAsSeen: overrides?.markMessageAsSeen ?? vi.fn()
  });
}

function createMockNoteCreator(): EmailNoteCreator {
  return strictProxy<EmailNoteCreator>({
    saveEmailAsNote: vi.fn()
  });
}

function createMockPlugin(overrides?: MockPluginOverrides): Plugin {
  return strictProxy<Plugin>({
    registerInterval: vi.fn((id: number) => id),
    settings: {
      emailAddress: overrides?.emailAddress ?? 'test@mail.tm',
      emailCheckIntervalInMinutes: overrides?.emailCheckIntervalInMinutes ?? 10,
      shouldDeleteSeenEmails: overrides?.shouldDeleteSeenEmails ?? false
    }
  });
}

describe('EmailChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(activeWindow.setInterval).mockReturnValue(0);
  });

  describe('checkEmails', () => {
    it('should return early when no email address configured', async () => {
      const mockManager = createMockMailTmManager();
      const plugin = createMockPlugin({ emailAddress: '' });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker(plugin, mockManager, noteCreator);

      await checker.checkEmails();

      expect(mockManager.getMessages).not.toHaveBeenCalled();
    });

    it('should show notice when no unseen messages', async () => {
      const mockManager = createMockMailTmManager({
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            id: '1',
            seen: true,
            size: 0,
            subject: 'Old',
            to: [],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin();
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker(plugin, mockManager, noteCreator);

      await checker.checkEmails();

      expect(mockNotice).toHaveBeenCalledWith('No new emails');
    });

    it('should delegate to noteCreator.saveEmailAsNote for unseen messages', async () => {
      const unseenMessage = {
        createdAt: '2026-01-01T00:00:00+00:00',
        downloadUrl: '',
        from: { address: 'sender@example.com', name: 'Sender' },
        hasAttachments: false,
        id: 'msg1',
        seen: false,
        size: 100,
        subject: 'Test Email',
        to: [{ address: 'me@mail.tm', name: '' }],
        updatedAt: '2026-01-01T00:00:00+00:00'
      };
      const mockManager = createMockMailTmManager({
        getMessages: vi.fn(async () => [unseenMessage])
      });
      const plugin = createMockPlugin();
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker(plugin, mockManager, noteCreator);

      await checker.checkEmails();

      expect(noteCreator.saveEmailAsNote).toHaveBeenCalledWith(unseenMessage);
      expect(mockNotice).toHaveBeenCalledWith('Saved 1 new email(s)');
    });

    it('should delete message after save when shouldDeleteSeenEmails is enabled', async () => {
      const mockManager = createMockMailTmManager({
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Test',
            to: [],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin({ shouldDeleteSeenEmails: true });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker(plugin, mockManager, noteCreator);

      await checker.checkEmails();

      expect(mockManager.deleteMessage).toHaveBeenCalledWith('msg1');
    });

    it('should mark message as seen when shouldDeleteSeenEmails is disabled', async () => {
      const mockManager = createMockMailTmManager({
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Test',
            to: [],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin({ shouldDeleteSeenEmails: false });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker(plugin, mockManager, noteCreator);

      await checker.checkEmails();

      expect(mockManager.deleteMessage).not.toHaveBeenCalled();
      expect(mockManager.markMessageAsSeen).toHaveBeenCalledWith('msg1');
    });
  });

  describe('redownloadEmails', () => {
    it('should redownload all messages regardless of seen status', async () => {
      const mockManager = createMockMailTmManager({
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            id: 'msg1',
            seen: true,
            size: 0,
            subject: 'Test',
            to: [],
            updatedAt: ''
          },
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            id: 'msg2',
            seen: true,
            size: 0,
            subject: 'Test2',
            to: [],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin();
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker(plugin, mockManager, noteCreator);

      await checker.redownloadEmails();

      expect(noteCreator.saveEmailAsNote).toHaveBeenCalledTimes(2);
      expect(mockNotice).toHaveBeenCalledWith('Redownloaded 2 email(s)');
    });

    it('should limit to count when specified', async () => {
      const mockManager = createMockMailTmManager({
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Test',
            to: [],
            updatedAt: ''
          },
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            id: 'msg2',
            seen: false,
            size: 0,
            subject: 'Test2',
            to: [],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin();
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker(plugin, mockManager, noteCreator);

      await checker.redownloadEmails(1);

      expect(noteCreator.saveEmailAsNote).toHaveBeenCalledTimes(1);
      expect(mockNotice).toHaveBeenCalledWith('Redownloaded 1 email(s)');
    });
  });

  describe('scheduleCheckEmails', () => {
    it('should not schedule when interval is 0', () => {
      const mockManager = createMockMailTmManager();
      const plugin = createMockPlugin({ emailCheckIntervalInMinutes: 0 });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker(plugin, mockManager, noteCreator);

      checker.scheduleCheckEmails();

      expect(plugin.registerInterval).not.toHaveBeenCalled();
    });

    it('should schedule with correct interval', () => {
      const mockSetInterval = vi.fn(() => 42);
      vi.stubGlobal('activeWindow', { setInterval: mockSetInterval });

      const mockManager = createMockMailTmManager();
      const plugin = createMockPlugin({ emailCheckIntervalInMinutes: 5 });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker(plugin, mockManager, noteCreator);

      checker.scheduleCheckEmails();

      const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), FIVE_MINUTES_IN_MS);
    });

    it('should clear previous interval before scheduling new one', () => {
      const mockClearInterval = vi.fn();
      vi.stubGlobal('clearInterval', mockClearInterval);
      vi.stubGlobal('activeWindow', { setInterval: vi.fn(() => 1) });

      const mockManager = createMockMailTmManager();
      const plugin = createMockPlugin({ emailCheckIntervalInMinutes: 5 });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker(plugin, mockManager, noteCreator);

      checker.scheduleCheckEmails();
      checker.scheduleCheckEmails();

      expect(mockClearInterval).toHaveBeenCalled();
    });
  });
});
