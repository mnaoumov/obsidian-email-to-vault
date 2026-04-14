export const DEFAULT_EMAIL_NOTE_TEMPLATE = `---
from: "{{from}}"
to: "{{to}}"
cc: "{{cc}}"
subject: "{{subject}}"
date: {{date}}
---

{{body}}`;

const DEFAULT_EMAIL_CHECK_INTERVAL_IN_MINUTES = 10;

export class PluginSettings {
  public emailAddress = '';
  public emailCheckIntervalInMinutes = DEFAULT_EMAIL_CHECK_INTERVAL_IN_MINUTES;
  public emailNotesFolder = 'Emails';
  public emailNoteTemplate = DEFAULT_EMAIL_NOTE_TEMPLATE;
  public emailPasswordSecretKey = '';
}
