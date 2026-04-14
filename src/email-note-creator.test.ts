import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type {
  MailTmManager,
  MailTmMessage
} from './mail-tm-manager.ts';
import type { Plugin } from './plugin.ts';

import { EmailNoteCreator } from './email-note-creator.ts';
import { DEFAULT_EMAIL_NOTE_TEMPLATE } from './plugin-settings.ts';

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    Notice: vi.fn()
  };
});

interface MockMailTmManagerOverrides {
  downloadAttachment?: MailTmManager['downloadAttachment'];
  getMessage?: MailTmManager['getMessage'];
}

interface MockMessageOverrides {
  id?: string;
  seen?: boolean;
  subject?: string;
}

interface MockPluginOverrides {
  emailNotePathTemplate?: string;
  emailNoteTemplate?: string;
  shouldStripForwardMarkers?: boolean;
}

function createMessage(overrides?: MockMessageOverrides): MailTmMessage {
  return {
    createdAt: '2026-01-01T00:00:00+00:00',
    downloadUrl: '',
    from: { address: 'a@b.com', name: '' },
    hasAttachments: false,
    id: overrides?.id ?? 'msg1',
    seen: overrides?.seen ?? false,
    size: 0,
    subject: overrides?.subject ?? 'Test',
    to: [],
    updatedAt: ''
  };
}

function createMockMailTmManager(overrides?: MockMailTmManagerOverrides): MailTmManager {
  return strictProxy<MailTmManager>({
    downloadAttachment: overrides?.downloadAttachment ?? vi.fn(),
    getMessage: overrides?.getMessage ?? vi.fn()
  });
}

function createMockPlugin(overrides?: MockPluginOverrides): Plugin {
  return strictProxy<Plugin>({
    app: {
      fileManager: {
        getAvailablePathForAttachment: vi.fn(async (filename: string) => `Emails/${filename}`)
      },
      vault: {
        create: vi.fn(),
        createBinary: vi.fn(),
        createFolder: vi.fn(),
        getFolderByPath: vi.fn(() => null)
      }
    },
    settings: {
      emailNotePathTemplate: overrides?.emailNotePathTemplate ?? 'Emails/{{date:YYYY-MM-DD HH-mm}} {{subject}}',
      emailNoteTemplate: overrides?.emailNoteTemplate ?? DEFAULT_EMAIL_NOTE_TEMPLATE,
      shouldStripForwardMarkers: overrides?.shouldStripForwardMarkers ?? false
    }
  });
}

describe('EmailNoteCreator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveEmailAsNote', () => {
    it('should save unseen messages as notes', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          attachments: [],
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
        }))
      });
      const plugin = createMockPlugin();
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Test Email' }));

      expect(plugin.app.vault.createFolder).toHaveBeenCalledWith('Emails');
      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.stringMatching(/^Emails\/\d{4}-\d{2}-\d{2} \d{2}-\d{2} Test Email\.md$/),
        expect.stringContaining('Hello body')
      );
    });

    it('should use template with all variables', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          attachments: [],
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
        }))
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} {{to}} {{cc}} {{subject}} {{date}} {{body}}'
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Subject Line' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'sender@example.com me@mail.tm cc@example.com Subject Line 2026-01-01T00:00:00+00:00 Body text'
      );
    });

    it('should format from address with name when available', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          attachments: [],
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
        }))
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{to}}'
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage());

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'John Doe <sender@example.com> | Me <me@mail.tm>'
      );
    });

    it('should not create folder if it already exists', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          attachments: [],
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
        }))
      });
      const plugin = createMockPlugin();
      vi.mocked(plugin.app.vault.getFolderByPath).mockReturnValue({} as never);
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage());

      expect(plugin.app.vault.createFolder).not.toHaveBeenCalled();
    });

    it('should sanitize subject in filename', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          attachments: [],
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
        }))
      });
      const plugin = createMockPlugin();
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Re: Test/File<Name>' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Re_ Test_File_Name_'),
        expect.any(String)
      );
    });

    it('should use custom path template', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          attachments: [],
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
        }))
      });
      const plugin = createMockPlugin({ emailNotePathTemplate: 'Custom/{{subject}}' });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Test Email' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        'Custom/Test Email.md',
        expect.any(String)
      );
    });

    it('should format date in path template', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          attachments: [],
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
        }))
      });
      const plugin = createMockPlugin({ emailNotePathTemplate: '{{date:YYYY-MM-DD}}/{{subject}}' });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Test Email' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}\/Test Email\.md$/),
        expect.any(String)
      );
    });

    it('should use Untitled in path template when subject is empty', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          attachments: [],
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
        }))
      });
      const plugin = createMockPlugin({ emailNotePathTemplate: 'Notes/{{subject}}' });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: '' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        'Notes/Untitled.md',
        expect.any(String)
      );
    });

    it('should not strip forward markers when disabled', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          attachments: [],
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
        }))
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} {{subject}} {{body}}'
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Fwd: Original Subject' }));

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
          attachments: [],
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
        }))
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{subject}} | {{body}}',
        shouldStripForwardMarkers: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Fwd: Original Subject' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Original <orig@test.com> | Original Subject | Actual body'
      );
    });

    it('should extract original sender from Outlook forward header', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          attachments: [],
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
        }))
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{subject}} | {{body}}',
        shouldStripForwardMarkers: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'FW: Outlook Subject' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Original Sender <orig@test.com> | Outlook Subject | Outlook body content'
      );
    });

    it('should strip Fwd: prefix from subject', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          attachments: [],
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
        }))
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{subject}}',
        shouldStripForwardMarkers: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Fwd: Test' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Test'
      );
    });

    it('should strip FW: prefix from subject', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          attachments: [],
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
        }))
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{subject}}',
        shouldStripForwardMarkers: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'FW: Test' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Test'
      );
    });

    it('should keep message as-is when no forward markers found', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          attachments: [],
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
        }))
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{subject}} | {{body}}',
        shouldStripForwardMarkers: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Regular Subject' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Sender <sender@example.com> | Regular Subject | Regular body without any forward markers'
      );
    });

    it('should use Untitled when subject is empty', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          attachments: [],
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
        }))
      });
      const plugin = createMockPlugin();
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: '' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.stringContaining('Untitled'),
        expect.any(String)
      );
    });

    it('should download and save attachments', async () => {
      const mockAttachmentData = new ArrayBuffer(8);
      const mockManager = createMockMailTmManager({
        downloadAttachment: vi.fn(async () => mockAttachmentData),
        getMessage: vi.fn(async () => ({
          attachments: [
            { filename: 'photo.png', id: 'att1' },
            { filename: 'doc.pdf', id: 'att2' }
          ],
          cc: [],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'a@b.com', name: '' },
          hasAttachments: true,
          html: [],
          id: 'msg1',
          seen: false,
          size: 0,
          subject: 'With Attachments',
          text: 'Body',
          to: [],
          updatedAt: ''
        }))
      });
      const plugin = createMockPlugin();
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'With Attachments' }));

      expect(mockManager.downloadAttachment).toHaveBeenCalledWith('msg1', 'att1');
      expect(mockManager.downloadAttachment).toHaveBeenCalledWith('msg1', 'att2');
      expect(plugin.app.vault.createBinary).toHaveBeenCalledTimes(2);
    });

    it('should add attachment links to note content', async () => {
      const mockAttachmentData = new ArrayBuffer(8);
      const mockManager = createMockMailTmManager({
        downloadAttachment: vi.fn(async () => mockAttachmentData),
        getMessage: vi.fn(async () => ({
          attachments: [{ filename: 'photo.png', id: 'att1' }],
          cc: [],
          createdAt: '2026-01-01T00:00:00+00:00',
          downloadUrl: '',
          from: { address: 'a@b.com', name: '' },
          hasAttachments: true,
          html: [],
          id: 'msg1',
          seen: false,
          size: 0,
          subject: 'Test',
          text: 'Body',
          to: [],
          updatedAt: ''
        }))
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{body}}\n{{attachments}}'
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage());

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Body\n![[photo.png]]'
      );
    });

    it('should skip attachments when none present', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => ({
          attachments: [],
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
          text: 'Body',
          to: [],
          updatedAt: ''
        }))
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{body}}{{attachments}}'
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage());

      expect(mockManager.downloadAttachment).not.toHaveBeenCalled();
      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Body'
      );
    });
  });
});
