import dedent from 'dedent';
import {
  describe,
  expect,
  it
} from 'vitest';

import { PluginSettings } from './plugin-settings.ts';
import { EmailProviderType } from './providers/email-provider-type.ts';

const EXPECTED_DEFAULT_EMAIL_NOTE_PATH_TEMPLATE = 'Emails/{{date:YYYY-MM-DD}} {{subject}}';
const EXPECTED_DEFAULT_EMAIL_NOTE_TEMPLATE = dedent`
  ---
  from: "{{from}}"
  to: "{{to}}"
  cc: "{{cc}}"
  subject: "{{subject}}"
  date: {{date}}
  ---

  {{body}}

  {{attachments}}
`;

describe('PluginSettings', () => {
  it('should have correct default values', () => {
    const settings = new PluginSettings();
    expect(settings.emailAddress).toBe('');
    expect(settings.emailCheckIntervalInMinutes).toBe(10);
    expect(settings.emailNotePathTemplate).toBe(EXPECTED_DEFAULT_EMAIL_NOTE_PATH_TEMPLATE);
    expect(settings.shouldDeleteSeenEmails).toBe(false);
    expect(settings.shouldExtractForwardedEmail).toBe(true);
    expect(settings.emailNoteTemplate).toBe(EXPECTED_DEFAULT_EMAIL_NOTE_TEMPLATE);
    expect(settings.emailPasswordSecretKey).toBe('');
    expect(settings.emailProviderType).toBe(EmailProviderType.MailTm);
    expect(settings.imapHost).toBe('');
    expect(settings.imapMailbox).toBe('INBOX');
    expect(settings.imapPort).toBe(993);
    expect(settings.imapTls).toBe(true);
  });
});

describe('default email note template', () => {
  it('should contain all template placeholders', () => {
    const template = new PluginSettings().emailNoteTemplate;
    expect(template).toContain('{{from}}');
    expect(template).toContain('{{to}}');
    expect(template).toContain('{{cc}}');
    expect(template).toContain('{{subject}}');
    expect(template).toContain('{{date}}');
    expect(template).toContain('{{body}}');
  });

  it('should have YAML frontmatter structure', () => {
    const template = new PluginSettings().emailNoteTemplate;
    expect(template).toMatch(/^---\n/);
    expect(template).toMatch(/\n---\n/);
  });
});
