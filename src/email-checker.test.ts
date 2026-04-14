import { Notice } from 'obsidian';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { MailTmManager } from './mail-tm-manager.ts';
import type { Plugin } from './plugin.ts';

import { EmailChecker } from './email-checker.ts';
import { DEFAULT_EMAIL_NOTE_TEMPLATE } from './plugin-settings.ts';

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
  getMessage?: MailTmManager['getMessage'];
  getMessages?: MailTmManager['getMessages'];
}

interface MockPluginOverrides {
  emailAddress?: string;
  emailCheckIntervalInMinutes?: number;
  emailNotePathTemplate?: string;
  emailNoteTemplate?: string;
  shouldStripForwardMarkers?: boolean;
}

function createMockMailTmManager(overrides?: MockMailTmManagerOverrides): MailTmManager {
  return strictProxy<MailTmManager>({
    getMessage: overrides?.getMessage ?? vi.fn(),
    getMessages: overrides?.getMessages ?? vi.fn(async () => [])
  });
}

function createMockPlugin(overrides?: MockPluginOverrides): Plugin {
  return strictProxy<Plugin>({
    app: {
      vault: {
        create: vi.fn(),
        createFolder: vi.fn(),
        getFolderByPath: vi.fn(() => null)
      }
    },
    registerInterval: vi.fn((id: number) => id),
    settings: {
      emailAddress: overrides?.emailAddress ?? 'test@mail.tm',
      emailCheckIntervalInMinutes: overrides?.emailCheckIntervalInMinutes ?? 10,
      emailNotePathTemplate: overrides?.emailNotePathTemplate ?? 'Emails/{{date:YYYY-MM-DD HH-mm}} {{subject}}',
      emailNoteTemplate: overrides?.emailNoteTemplate ?? DEFAULT_EMAIL_NOTE_TEMPLATE,
      shouldStripForwardMarkers: overrides?.shouldStripForwardMarkers ?? false
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
      const checker = new EmailChecker(plugin, mockManager);

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
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(mockNotice).toHaveBeenCalledWith('No new emails');
    });

    it('should save unseen messages as notes', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          cc: [{ address: 'cc@example.com', name: 'CC User' }],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'sender@example.com', name: 'Sender' },
          hasAttachments: false,
          html: [],
          id: 'msg1',
          seen: false,
          size: 100,
          subject: 'Test Email',
          text: 'Hello body',
          to: [{ address: 'me@mail.tm', name: '' }],
          updatedAt: '2026-01-01T00:00:00+00:00'
        })),
        getMessages: vi.fn(async () => [
          {
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
          }
        ])
      });
      const plugin = createMockPlugin();
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(plugin.app.vault.createFolder).toHaveBeenCalledWith('Emails');
      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.stringMatching(/^Emails\/\d{4}-\d{2}-\d{2} \d{2}-\d{2} Test Email\.md$/),
        expect.stringContaining('Hello body')
      );
      expect(mockNotice).toHaveBeenCalledWith('Saved 1 new email(s)');
    });

    it('should use template with all variables', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          cc: [{ address: 'cc@example.com', name: '' }],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'sender@example.com', name: '' },
          hasAttachments: false,
          html: [],
          id: 'msg1',
          seen: false,
          size: 100,
          subject: 'Subject Line',
          text: 'Body text',
          to: [{ address: 'me@mail.tm', name: '' }],
          updatedAt: '2026-01-01T00:00:00+00:00'
        })),
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'sender@example.com', name: '' },
            hasAttachments: false,
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Subject Line',
            to: [],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} {{to}} {{cc}} {{subject}} {{date}} {{body}}'
      });
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'sender@example.com me@mail.tm cc@example.com Subject Line 2026-01-01T00:00:00+00:00 Body text'
      );
    });

    it('should format from address with name when available', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          cc: [],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'sender@example.com', name: 'John Doe' },
          hasAttachments: false,
          html: [],
          id: 'msg1',
          seen: false,
          size: 0,
          subject: 'Test',
          text: '',
          to: [{ address: 'me@mail.tm', name: 'Me' }],
          updatedAt: ''
        })),
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'sender@example.com', name: 'John Doe' },
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
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{to}}'
      });
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'John Doe <sender@example.com> | Me <me@mail.tm>'
      );
    });

    it('should not create folder if it already exists', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          cc: [],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'a@b.com', name: '' },
          hasAttachments: false,
          html: [],
          id: 'msg1',
          seen: false,
          size: 0,
          subject: 'Test',
          text: '',
          to: [],
          updatedAt: ''
        })),
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
      const plugin = createMockPlugin();
      vi.mocked(plugin.app.vault.getFolderByPath).mockReturnValue({} as never);
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(plugin.app.vault.createFolder).not.toHaveBeenCalled();
    });

    it('should sanitize subject in filename', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          cc: [],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'a@b.com', name: '' },
          hasAttachments: false,
          html: [],
          id: 'msg1',
          seen: false,
          size: 0,
          subject: 'Re: Test/File<Name>',
          text: '',
          to: [],
          updatedAt: ''
        })),
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Re: Test/File<Name>',
            to: [],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin();
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Re_ Test_File_Name_'),
        expect.any(String)
      );
    });

    it('should use custom path template', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          cc: [],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'a@b.com', name: '' },
          hasAttachments: false,
          html: [],
          id: 'msg1',
          seen: false,
          size: 0,
          subject: 'Test Email',
          text: '',
          to: [],
          updatedAt: ''
        })),
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Test Email',
            to: [],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin({ emailNotePathTemplate: 'Custom/{{subject}}' });
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        'Custom/Test Email.md',
        expect.any(String)
      );
    });

    it('should format date in path template', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          cc: [],
          createdAt: '2026-03-15T14:30:45+00:00',
          downloadUrl: '',
          from: { address: 'a@b.com', name: '' },
          hasAttachments: false,
          html: [],
          id: 'msg1',
          seen: false,
          size: 0,
          subject: 'Test Email',
          text: '',
          to: [],
          updatedAt: ''
        })),
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-03-15T14:30:45+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Test Email',
            to: [],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin({ emailNotePathTemplate: '{{date:YYYY-MM-DD}}/{{subject}}' });
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}\/Test Email\.md$/),
        expect.any(String)
      );
    });

    it('should use Untitled in path template when subject is empty', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          cc: [],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'a@b.com', name: '' },
          hasAttachments: false,
          html: [],
          id: 'msg1',
          seen: false,
          size: 0,
          subject: '',
          text: '',
          to: [],
          updatedAt: ''
        })),
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            id: 'msg1',
            seen: false,
            size: 0,
            subject: '',
            to: [],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin({ emailNotePathTemplate: 'Notes/{{subject}}' });
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        'Notes/Untitled.md',
        expect.any(String)
      );
    });

    it('should not strip forward markers when disabled', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          cc: [],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'forwarder@example.com', name: 'Forwarder' },
          hasAttachments: false,
          html: [],
          id: 'msg1',
          seen: false,
          size: 0,
          subject: 'Fwd: Original Subject',
          text:
            '---------- Forwarded message ---------\nFrom: Original <orig@test.com>\nDate: Mon, 1 Jan 2024\nSubject: Original Subject\nTo: dest@test.com\n\nActual body',
          to: [{ address: 'me@mail.tm', name: '' }],
          updatedAt: ''
        })),
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'forwarder@example.com', name: 'Forwarder' },
            hasAttachments: false,
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Fwd: Original Subject',
            to: [{ address: 'me@mail.tm', name: '' }],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} {{subject}} {{body}}'
      });
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Forwarder <forwarder@example.com>')
      );
      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('Fwd: Original Subject')
      );
    });

    it('should extract original sender from Gmail forward header', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          cc: [],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'forwarder@example.com', name: 'Forwarder' },
          hasAttachments: false,
          html: [],
          id: 'msg1',
          seen: false,
          size: 0,
          subject: 'Fwd: Original Subject',
          text:
            '---------- Forwarded message ---------\nFrom: Original <orig@test.com>\nDate: Mon, 1 Jan 2024\nSubject: Original Subject\nTo: dest@test.com\n\nActual body',
          to: [{ address: 'me@mail.tm', name: '' }],
          updatedAt: ''
        })),
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'forwarder@example.com', name: 'Forwarder' },
            hasAttachments: false,
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Fwd: Original Subject',
            to: [{ address: 'me@mail.tm', name: '' }],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{subject}} | {{body}}',
        shouldStripForwardMarkers: true
      });
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Original <orig@test.com> | Original Subject | Actual body'
      );
    });

    it('should extract original sender from Outlook forward header', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          cc: [],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'forwarder@example.com', name: 'Forwarder' },
          hasAttachments: false,
          html: [],
          id: 'msg1',
          seen: false,
          size: 0,
          subject: 'FW: Outlook Subject',
          text: 'From: Original Sender <orig@test.com>\nSent: Monday, January 1, 2024\nTo: dest@test.com\nSubject: Outlook Subject\n\nOutlook body content',
          to: [{ address: 'me@mail.tm', name: '' }],
          updatedAt: ''
        })),
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'forwarder@example.com', name: 'Forwarder' },
            hasAttachments: false,
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'FW: Outlook Subject',
            to: [{ address: 'me@mail.tm', name: '' }],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{subject}} | {{body}}',
        shouldStripForwardMarkers: true
      });
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Original Sender <orig@test.com> | Outlook Subject | Outlook body content'
      );
    });

    it('should strip Fwd: prefix from subject', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          cc: [],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'a@b.com', name: '' },
          hasAttachments: false,
          html: [],
          id: 'msg1',
          seen: false,
          size: 0,
          subject: 'Fwd: Test',
          text: 'Plain body without forward headers',
          to: [],
          updatedAt: ''
        })),
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Fwd: Test',
            to: [],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{subject}}',
        shouldStripForwardMarkers: true
      });
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Test'
      );
    });

    it('should strip FW: prefix from subject', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          cc: [],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'a@b.com', name: '' },
          hasAttachments: false,
          html: [],
          id: 'msg1',
          seen: false,
          size: 0,
          subject: 'FW: Test',
          text: 'Plain body without forward headers',
          to: [],
          updatedAt: ''
        })),
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'FW: Test',
            to: [],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{subject}}',
        shouldStripForwardMarkers: true
      });
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Test'
      );
    });

    it('should keep message as-is when no forward markers found', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          cc: [],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'sender@example.com', name: 'Sender' },
          hasAttachments: false,
          html: [],
          id: 'msg1',
          seen: false,
          size: 0,
          subject: 'Regular Subject',
          text: 'Regular body without any forward markers',
          to: [{ address: 'me@mail.tm', name: '' }],
          updatedAt: ''
        })),
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'sender@example.com', name: 'Sender' },
            hasAttachments: false,
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Regular Subject',
            to: [{ address: 'me@mail.tm', name: '' }],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{subject}} | {{body}}',
        shouldStripForwardMarkers: true
      });
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Sender <sender@example.com> | Regular Subject | Regular body without any forward markers'
      );
    });

    it('should use Untitled when subject is empty', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          cc: [],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'a@b.com', name: '' },
          hasAttachments: false,
          html: [],
          id: 'msg1',
          seen: false,
          size: 0,
          subject: '',
          text: '',
          to: [],
          updatedAt: ''
        })),
        getMessages: vi.fn(async () => [
          {
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            id: 'msg1',
            seen: false,
            size: 0,
            subject: '',
            to: [],
            updatedAt: ''
          }
        ])
      });
      const plugin = createMockPlugin();
      const checker = new EmailChecker(plugin, mockManager);

      await checker.checkEmails();

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Untitled'),
        expect.any(String)
      );
    });
  });

  describe('scheduleCheckEmails', () => {
    it('should not schedule when interval is 0', () => {
      const mockManager = createMockMailTmManager();
      const plugin = createMockPlugin({ emailCheckIntervalInMinutes: 0 });
      const checker = new EmailChecker(plugin, mockManager);

      checker.scheduleCheckEmails();

      expect(plugin.registerInterval).not.toHaveBeenCalled();
    });

    it('should schedule with correct interval', () => {
      const mockSetInterval = vi.fn(() => 42);
      vi.stubGlobal('activeWindow', { setInterval: mockSetInterval });

      const mockManager = createMockMailTmManager();
      const plugin = createMockPlugin({ emailCheckIntervalInMinutes: 5 });
      const checker = new EmailChecker(plugin, mockManager);

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
      const checker = new EmailChecker(plugin, mockManager);

      checker.scheduleCheckEmails();
      checker.scheduleCheckEmails();

      expect(mockClearInterval).toHaveBeenCalled();
    });
  });
});
