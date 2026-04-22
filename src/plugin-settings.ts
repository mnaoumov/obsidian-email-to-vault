import dedent from 'dedent';

import { EmailProviderType } from './providers/email-provider-type.ts';

export const DEFAULT_EMAIL_NOTE_TEMPLATE = dedent`
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

const DEFAULT_EMAIL_CHECK_INTERVAL_IN_MINUTES = 10;

export const DEFAULT_EMAIL_NOTE_PATH_TEMPLATE = 'Emails/{{date:YYYY-MM-DD}} {{subject}}';

export class PluginSettings {
  public emailAddress = '';
  public emailCheckIntervalInMinutes = DEFAULT_EMAIL_CHECK_INTERVAL_IN_MINUTES;
  public emailNotePathTemplate = DEFAULT_EMAIL_NOTE_PATH_TEMPLATE;
  public emailNoteTemplate = DEFAULT_EMAIL_NOTE_TEMPLATE;
  public emailPasswordSecretKey = '';
  public emailProviderType = EmailProviderType.MailTm;
  public shouldDeleteSeenEmails = false;
  public shouldExtractForwardedEmail = true;
  public shouldStripHiddenElements = true;
}
