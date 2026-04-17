import { noopAsync } from 'obsidian-dev-utils/function';
import { extractDefaultExportInterop } from 'obsidian-dev-utils/object-utils';
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
  MailTmMessage,
  MailTmMessageFull
} from './mail-tm-manager.ts';
import type { Plugin } from './plugin.ts';

import { EmailNoteCreator } from './email-note-creator.ts';
import { DEFAULT_EMAIL_NOTE_TEMPLATE } from './plugin-settings.ts';

const MOCK_UTC_OFFSET_MINUTES = 300;

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  const realMoment = extractDefaultExportInterop(original.moment);
  function wrappedMoment(...args: Parameters<typeof realMoment>): ReturnType<typeof realMoment> {
    return realMoment(...args).utcOffset(MOCK_UTC_OFFSET_MINUTES);
  }
  Object.assign(wrappedMoment, original.moment);
  return {
    ...original,
    htmlToMarkdown: vi.fn((html: string) => {
      let result = html;
      result = result.replace(/<img\s+src="(?<src>[^"]+)"\s+alt="(?<alt>[^"]*)"[^>]*>/g, '![$<alt>]($<src>)');
      result = result.replace(/<\/?[^>]+>/g, '');
      return result.trim();
    }),
    moment: wrappedMoment,
    Notice: vi.fn()
  };
});

interface MockFullMessageOverrides {
  subject?: string;
}

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
  shouldExtractForwardedEmail?: boolean;
}

function createFullMessage(overrides?: MockFullMessageOverrides): MailTmMessageFull {
  return {
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
    subject: overrides?.subject ?? 'Test',
    text: 'body',
    to: [],
    updatedAt: ''
  };
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
        getAvailablePathForAttachment: vi.fn(async (filename: string) => {
          await noopAsync();
          return `Emails/${filename}`;
        })
      },
      vault: {
        create: vi.fn(),
        createBinary: vi.fn(),
        createFolder: vi.fn(),
        getAvailablePath: vi.fn((path: string, ext: string) => `${path}.${ext}`),
        getFolderByPath: vi.fn(() => null)
      }
    },
    settings: {
      emailNotePathTemplate: overrides?.emailNotePathTemplate ?? 'Emails/{{date:YYYY-MM-DD HH-mm}} {{subject}}',
      emailNoteTemplate: overrides?.emailNoteTemplate ?? DEFAULT_EMAIL_NOTE_TEMPLATE,
      shouldExtractForwardedEmail: overrides?.shouldExtractForwardedEmail ?? false
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
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
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

    it('should convert HTML body to markdown', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
            attachments: [],
            cc: [],
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'sender@example.com', name: '' },
            hasAttachments: false,
            html: ['<p>Hello <strong>world</strong></p>'],
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Test',
            text: 'Hello world',
            to: [{ address: 'me@mail.tm', name: '' }],
            updatedAt: ''
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{body}}'
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage());

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Hello world'
      );
    });

    it('should fall back to plain text when HTML is empty', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
            attachments: [],
            cc: [],
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'sender@example.com', name: '' },
            hasAttachments: false,
            html: [],
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Test',
            text: 'Plain text body',
            to: [{ address: 'me@mail.tm', name: '' }],
            updatedAt: ''
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{body}}'
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage());

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Plain text body'
      );
    });

    it('should use template with all variables', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} {{to}} {{cc}} {{subject}} {{date}} {{body}}'
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Subject Line' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'sender@example.com me@mail.tm cc@example.com Subject Line 2026-01-01T05:00:00+05:00 Body text'
      );
    });

    it('should format from address with name when available', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
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
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
      });
      const plugin = createMockPlugin();
      vi.mocked(plugin.app.vault.getFolderByPath).mockReturnValue({} as never);
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage());

      expect(plugin.app.vault.createFolder).not.toHaveBeenCalled();
    });

    it('should sanitize subject in filename', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
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
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
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
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
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
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
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
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
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
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{subject}} | {{date}} | {{body}}',
        shouldExtractForwardedEmail: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Fwd: Original Subject' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Original <orig@test.com> | Original Subject | 2024-01-01T11:00:00+05:00 | Actual body'
      );
    });

    it('should strip bold markdown from Gmail forward header values', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
            subject: 'Fwd: Bold Subject',
            text:
              '---------- Forwarded message ---------\nFrom: **John Doe** <john@test.com>\nDate: Mon, 1 Jan 2024\nSubject: **Bold Subject**\nTo: dest@test.com\n\nForwarded body',
            to: [{ address: 'me@mail.tm', name: '' }],
            updatedAt: ''
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{subject}}',
        shouldExtractForwardedEmail: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Fwd: Bold Subject' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'John Doe <john@test.com> | Bold Subject'
      );
    });

    it('should strip link markdown from Gmail forward header values', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
            subject: 'Fwd: Linked Subject',
            text:
              '---------- Forwarded message ---------\nFrom: [Jane](mailto:jane@test.com)\nDate: Mon, 1 Jan 2024\nSubject: Linked Subject\nTo: [dest@test.com](mailto:dest@test.com)\n\nForwarded body',
            to: [{ address: 'me@mail.tm', name: '' }],
            updatedAt: ''
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{to}} | {{subject}}',
        shouldExtractForwardedEmail: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Fwd: Linked Subject' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Jane | dest@test.com | Linked Subject'
      );
    });

    it('should extract original sender from Outlook forward header', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{subject}} | {{body}}',
        shouldExtractForwardedEmail: true
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
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{subject}}',
        shouldExtractForwardedEmail: true
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
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{subject}}',
        shouldExtractForwardedEmail: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'FW: Test' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Test'
      );
    });

    it('should parse Gmail-style date in path template without warnings', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
              '---------- Forwarded message ---------\nFrom: Original <orig@test.com>\nDate: Tue, Apr 14, 2026 at 12:55 PM\nSubject: Original Subject\nTo: dest@test.com\n\nActual body',
            to: [{ address: 'me@mail.tm', name: '' }],
            updatedAt: ''
          };
        })
      });
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      const plugin = createMockPlugin({
        emailNotePathTemplate: '{{date:YYYY-MM-DD}}/{{subject}}',
        shouldExtractForwardedEmail: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Fwd: Original Subject' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        '2026-04-14/Original Subject.md',
        expect.any(String)
      );
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it('should keep message as-is when no forward markers found', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{subject}} | {{body}}',
        shouldExtractForwardedEmail: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Regular Subject' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Sender <sender@example.com> | Regular Subject | Regular body without any forward markers'
      );
    });

    it('should handle rfc822 attachment with headers only and no body', async () => {
      const emlContent = 'Content-Type: text/plain';
      const mockManager = createMockMailTmManager({
        downloadAttachment: vi.fn(async () => {
          await noopAsync();
          return new TextEncoder().encode(emlContent).buffer;
        }),
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
            attachments: [{ contentType: 'message/rfc822', filename: 'forwarded.eml', id: 'att1' }],
            cc: [],
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'forwarder@example.com', name: 'Forwarder' },
            hasAttachments: true,
            html: [],
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Fwd: Headers Only',
            text: 'Forwarded.',
            to: [{ address: 'me@mail.tm', name: '' }],
            updatedAt: ''
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{subject}} | {{body}}',
        shouldExtractForwardedEmail: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Fwd: Headers Only' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        ' |  | '
      );
    });

    it('should extract original email from message/rfc822 attachment', async () => {
      const emlContent =
        'From: original@test.com\r\nTo: dest@test.com\r\nCc: cc@test.com\r\nSubject: Original Subject\r\nDate: Mon, 1 Jan 2024 10:00:00 +0000\r\n\r\nOriginal body content';
      const mockManager = createMockMailTmManager({
        downloadAttachment: vi.fn(async () => {
          await noopAsync();
          return new TextEncoder().encode(emlContent).buffer;
        }),
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
            attachments: [{ contentType: 'message/rfc822', filename: 'forwarded.eml', id: 'att1' }],
            cc: [],
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'forwarder@example.com', name: 'Forwarder' },
            hasAttachments: true,
            html: [],
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Fwd: Original Subject',
            text: 'See the forwarded message attached.',
            to: [{ address: 'me@mail.tm', name: '' }],
            updatedAt: ''
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{to}} | {{cc}} | {{subject}} | {{body}}',
        shouldExtractForwardedEmail: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Fwd: Original Subject' }));

      expect(mockManager.downloadAttachment).toHaveBeenCalledWith('msg1', 'att1');
      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'original@test.com | dest@test.com | cc@test.com | Original Subject | Original body content'
      );
    });

    it('should use Untitled when subject is empty', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
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
        downloadAttachment: vi.fn(async () => {
          await noopAsync();
          return mockAttachmentData;
        }),
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
            attachments: [
              { contentType: 'image/png', filename: 'photo.png', id: 'att1' },
              { contentType: 'application/pdf', filename: 'doc.pdf', id: 'att2' }
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
          };
        })
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
        downloadAttachment: vi.fn(async () => {
          await noopAsync();
          return mockAttachmentData;
        }),
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
            attachments: [{ contentType: 'image/png', filename: 'photo.png', id: 'att1' }],
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
          };
        })
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
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
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

    it('should handle undefined attachments from API', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          } as never;
        })
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

    it('should handle undefined attachments when extracting forwarded email', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          } as never;
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{from}} | {{subject}} | {{body}}',
        shouldExtractForwardedEmail: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Fwd: Original Subject' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Original <orig@test.com> | Original Subject | Actual body'
      );
    });

    it('should use original date when Gmail forward header has no Date line', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
            text: '---------- Forwarded message ---------\nFrom: Original <orig@test.com>\nSubject: Original Subject\nTo: dest@test.com\n\nActual body',
            to: [{ address: 'me@mail.tm', name: '' }],
            updatedAt: ''
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{date}}',
        shouldExtractForwardedEmail: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Fwd: Original Subject' }));

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        '2026-01-01T05:00:00+05:00'
      );
    });

    it('should handle Gmail forward date with narrow no-break space before AM/PM', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
            attachments: [],
            cc: [],
            createdAt: '2026-04-14T23:27:48+00:00',
            downloadUrl: '',
            from: { address: 'forwarder@example.com', name: 'Forwarder' },
            hasAttachments: false,
            html: [],
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Fwd: Original Subject',
            text:
              '---------- Forwarded message ---------\nFrom: Original <orig@test.com>\nDate: Tue, Apr 14, 2026 at 5:16\u202FAM\nSubject: Original Subject\nTo: dest@test.com\n\nBody content',
            to: [{ address: 'me@mail.tm', name: '' }],
            updatedAt: ''
          };
        })
      });
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      const plugin = createMockPlugin({
        emailNotePathTemplate: 'Emails/{{date:YYYY-MM-DD HH-mm}} {{subject}}',
        emailNoteTemplate: '{{from}} | {{subject}} | {{date}} | {{body}}',
        shouldExtractForwardedEmail: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ subject: 'Fwd: Original Subject' }));

      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        'Emails/2026-04-14 16-16 Original Subject.md',
        expect.stringContaining('Original <orig@test.com>')
      );
      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('| 2026-04-14T16:16:00+05:00 |')
      );
    });

    it('should handle Gmail forward with empty original subject', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
            attachments: [],
            cc: [],
            createdAt: '2026-04-14T21:55:44+00:00',
            downloadUrl: '',
            from: { address: 'mnaoumov@gmail.com', name: 'Michael Naumov' },
            hasAttachments: false,
            html: [],
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Fwd:',
            text:
              'Regards,\nMichael Naumov\n\n\n---------- Forwarded message ---------\nFrom: Leonid Naumov <leonid.naumov@colegiofinlandes.edu.mx>\nDate: Tue, Apr 14, 2026 at 12:55 PM\nSubject:\nTo: Michael Naumov <mnaoumov@gmail.com>\n\n\nнапечатай пж 4 на 10см',
            to: [{ address: 'email-to-vault-ohqlfltv1i@deltajohnsons.com', name: '' }],
            updatedAt: ''
          };
        })
      });
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      const plugin = createMockPlugin({
        emailNotePathTemplate: 'Emails/{{date:YYYY-MM-DD HH-mm}} {{subject}}',
        emailNoteTemplate: '{{from}} | {{subject}} | {{date}} | {{body}}',
        shouldExtractForwardedEmail: true
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage({ id: 'msg1', subject: 'Fwd:' }));

      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        'Emails/2026-04-14 23-55 Untitled.md',
        expect.stringContaining('Leonid Naumov <leonid.naumov@colegiofinlandes.edu.mx>')
      );
    });

    it('should replace inline attachment references with vault links', async () => {
      const mockAttachmentData = new ArrayBuffer(8);
      const mockManager = createMockMailTmManager({
        downloadAttachment: vi.fn(async () => {
          await noopAsync();
          return mockAttachmentData;
        }),
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
            attachments: [{ contentType: 'image/png', filename: 'photo.png', id: 'ATTACH000001' }],
            cc: [],
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: true,
            html: ['<div><img src="attachment:ATTACH000001" alt="photo.png"><p>Text</p></div>'],
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Test',
            text: '[image: photo.png]\nText',
            to: [],
            updatedAt: ''
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{body}}'
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage());

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('![[photo.png]]')
      );
      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.stringContaining('attachment:')
      );
    });

    it('should use alt text when inline attachment ID is not in saved attachments', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
            attachments: [],
            cc: [],
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            html: ['<div><img src="attachment:UNKNOWN" alt="mystery.png"></div>'],
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Test',
            text: '',
            to: [],
            updatedAt: ''
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{body}}'
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage());

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('![[mystery.png]]')
      );
    });

    it('should handle attachment path without folder', async () => {
      const mockAttachmentData = new ArrayBuffer(8);
      const mockManager = createMockMailTmManager({
        downloadAttachment: vi.fn(async () => {
          await noopAsync();
          return mockAttachmentData;
        }),
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
            attachments: [{ contentType: 'image/png', filename: 'photo.png', id: 'att1' }],
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
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{attachments}}'
      });
      vi.mocked(plugin.app.fileManager.getAvailablePathForAttachment).mockResolvedValue('photo.png');
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage());

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        '![[photo.png]]'
      );
    });

    it('should use fallback name when inline attachment has empty alt', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
            attachments: [],
            cc: [],
            createdAt: '2026-01-01T00:00:00+00:00',
            downloadUrl: '',
            from: { address: 'a@b.com', name: '' },
            hasAttachments: false,
            html: ['<div><img src="attachment:UNKNOWN" alt=""></div>'],
            id: 'msg1',
            seen: false,
            size: 0,
            subject: 'Test',
            text: '',
            to: [],
            updatedAt: ''
          };
        })
      });
      const plugin = createMockPlugin({
        emailNoteTemplate: '{{body}}'
      });
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage());

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('![[attachment]]')
      );
    });

    it('should not create folder when path has no directory', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
      });
      const plugin = createMockPlugin({ emailNotePathTemplate: '{{subject}}' });
      vi.mocked(plugin.app.vault.getAvailablePath).mockReturnValue('Test.md');
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage());

      expect(plugin.app.vault.createFolder).not.toHaveBeenCalled();
      expect(plugin.app.vault.create).toHaveBeenCalledWith('Test.md', expect.any(String));
    });

    it('should use available path from vault when note file already exists', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return {
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
          };
        })
      });
      const plugin = createMockPlugin({ emailNotePathTemplate: 'Emails/{{subject}}' });
      vi.mocked(plugin.app.vault.getAvailablePath).mockReturnValue('Emails/Test 2.md');
      const noteCreator = new EmailNoteCreator(plugin, mockManager);

      await noteCreator.saveEmailAsNote(createMessage());

      expect(plugin.app.vault.getAvailablePath).toHaveBeenCalledWith('Emails/Test', 'md');
      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        'Emails/Test 2.md',
        expect.any(String)
      );
    });

    it('should expand date format in content template', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return createFullMessage({ subject: 'Test' });
        })
      });
      const plugin = createMockPlugin({ emailNoteTemplate: 'Date: {{date:YYYY-MM-DD}}' });
      const creator = new EmailNoteCreator(plugin, mockManager);

      await creator.saveEmailAsNote(createMessage());

      expect(plugin.app.vault.create).toHaveBeenCalledWith(
        expect.any(String),
        'Date: 2026-01-01'
      );
    });

    it('should throw when attachments token has format', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return createFullMessage({ subject: 'Test' });
        })
      });
      const plugin = createMockPlugin({ emailNoteTemplate: '{{attachments:foo}}' });
      const creator = new EmailNoteCreator(plugin, mockManager);

      await expect(creator.saveEmailAsNote(createMessage())).rejects.toThrow('Attachments token does not support format: foo');
    });

    it('should throw when attachments token is used in path template', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return createFullMessage({ subject: 'Test' });
        })
      });
      const plugin = createMockPlugin({ emailNotePathTemplate: '{{attachments}}' });
      const creator = new EmailNoteCreator(plugin, mockManager);

      await expect(creator.saveEmailAsNote(createMessage())).rejects.toThrow('Attachments token is not supported in path template');
    });

    it('should throw when body token has format', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return createFullMessage({ subject: 'Test' });
        })
      });
      const plugin = createMockPlugin({ emailNoteTemplate: '{{body:foo}}' });
      const creator = new EmailNoteCreator(plugin, mockManager);

      await expect(creator.saveEmailAsNote(createMessage())).rejects.toThrow('Body token does not support format: foo');
    });

    it('should throw when body token is used in path template', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return createFullMessage({ subject: 'Test' });
        })
      });
      const plugin = createMockPlugin({ emailNotePathTemplate: '{{body}}' });
      const creator = new EmailNoteCreator(plugin, mockManager);

      await expect(creator.saveEmailAsNote(createMessage())).rejects.toThrow('Body token is not supported in path template');
    });

    it('should throw when cc token has format', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return createFullMessage({ subject: 'Test' });
        })
      });
      const plugin = createMockPlugin({ emailNoteTemplate: '{{cc:foo}}' });
      const creator = new EmailNoteCreator(plugin, mockManager);

      await expect(creator.saveEmailAsNote(createMessage())).rejects.toThrow('CC token does not support format: foo');
    });

    it('should throw when from token has format', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return createFullMessage({ subject: 'Test' });
        })
      });
      const plugin = createMockPlugin({ emailNoteTemplate: '{{from:foo}}' });
      const creator = new EmailNoteCreator(plugin, mockManager);

      await expect(creator.saveEmailAsNote(createMessage())).rejects.toThrow('From token does not support format: foo');
    });

    it('should throw when subject token has format', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return createFullMessage({ subject: 'Test' });
        })
      });
      const plugin = createMockPlugin({ emailNoteTemplate: '{{subject:foo}}' });
      const creator = new EmailNoteCreator(plugin, mockManager);

      await expect(creator.saveEmailAsNote(createMessage())).rejects.toThrow('Subject token does not support format: foo');
    });

    it('should throw when to token has format', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return createFullMessage({ subject: 'Test' });
        })
      });
      const plugin = createMockPlugin({ emailNoteTemplate: '{{to:foo}}' });
      const creator = new EmailNoteCreator(plugin, mockManager);

      await expect(creator.saveEmailAsNote(createMessage())).rejects.toThrow('To token does not support format: foo');
    });

    it('should throw when unknown token is used', async () => {
      const mockManager = createMockMailTmManager({
        getMessage: vi.fn(async () => {
          await noopAsync();
          return createFullMessage({ subject: 'Test' });
        })
      });
      const plugin = createMockPlugin({ emailNoteTemplate: '{{unknown}}' });
      const creator = new EmailNoteCreator(plugin, mockManager);

      await expect(creator.saveEmailAsNote(createMessage())).rejects.toThrow('Unknown token: unknown');
    });
  });
});
