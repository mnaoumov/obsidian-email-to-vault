import {
  describe,
  expect,
  it
} from 'vitest';

import {
  DEFAULT_EMAIL_NOTE_PATH_TEMPLATE,
  DEFAULT_EMAIL_NOTE_TEMPLATE,
  PluginSettings
} from './plugin-settings.ts';
import { EmailProviderType } from './providers/email-provider-type.ts';

describe('PluginSettings', () => {
  it('should have correct default values', () => {
    const settings = new PluginSettings();
    expect(settings.emailAddress).toBe('');
    expect(settings.emailCheckIntervalInMinutes).toBe(10);
    expect(settings.emailNotePathTemplate).toBe(DEFAULT_EMAIL_NOTE_PATH_TEMPLATE);
    expect(settings.shouldDeleteSeenEmails).toBe(false);
    expect(settings.shouldExtractForwardedEmail).toBe(true);
    expect(settings.emailNoteTemplate).toBe(DEFAULT_EMAIL_NOTE_TEMPLATE);
    expect(settings.emailPasswordSecretKey).toBe('');
    expect(settings.emailProviderType).toBe(EmailProviderType.MailTm);
    expect(settings.imapHost).toBe('');
    expect(settings.imapMailbox).toBe('INBOX');
    expect(settings.imapPort).toBe(993);
    expect(settings.imapTls).toBe(true);
  });
});

describe('DEFAULT_EMAIL_NOTE_TEMPLATE', () => {
  it('should contain all template placeholders', () => {
    expect(DEFAULT_EMAIL_NOTE_TEMPLATE).toContain('{{from}}');
    expect(DEFAULT_EMAIL_NOTE_TEMPLATE).toContain('{{to}}');
    expect(DEFAULT_EMAIL_NOTE_TEMPLATE).toContain('{{cc}}');
    expect(DEFAULT_EMAIL_NOTE_TEMPLATE).toContain('{{subject}}');
    expect(DEFAULT_EMAIL_NOTE_TEMPLATE).toContain('{{date}}');
    expect(DEFAULT_EMAIL_NOTE_TEMPLATE).toContain('{{body}}');
  });

  it('should have YAML frontmatter structure', () => {
    expect(DEFAULT_EMAIL_NOTE_TEMPLATE).toMatch(/^---\n/);
    expect(DEFAULT_EMAIL_NOTE_TEMPLATE).toMatch(/\n---\n/);
  });
});
