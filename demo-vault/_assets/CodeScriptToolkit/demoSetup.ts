import type { App } from 'obsidian';

import {
  Notice,
  Platform
} from 'obsidian';
import { configureCommunityPlugin } from '@mnaoumov/obsidian-lib/community-plugins';

// Not every headline feature gets a button here: the feature fetches real mail from a live service over the
// network, so no button can produce an email for you. What the buttons DO remove is everything either
// side of that — opening the settings tab, choosing the provider and its server, running the fetch, and the
// multi-line note templates, which are the fiddly part to type and the part worth experimenting with.
//
// Two things stay deliberately manual. Registering a Mail.tm address creates a real mailbox on a third-party
// service, so it is one click in the settings tab rather than a button anyone (or a test run) presses by
// accident. And no button types your IMAP login or password: the password belongs in Obsidian's secret
// storage, entered by you.

const PLUGIN_ID = 'email-to-vault';

// The values of the plugin's `EmailProviderType` enum.
const MAIL_TM_PROVIDER = 'mail-tm';
const IMAP_PROVIDER = 'imap';

const IMAP_TLS_PORT = 993;

interface DemoSettingsPatch {
  emailCheckIntervalInMinutes?: number;
  emailNotePathTemplate?: string;
  emailNoteTemplate?: string;
  emailProviderType?: string;
  imapHost?: string;
  imapMailbox?: string;
  imapPort?: number;
  imapTls?: boolean;
  shouldDeleteSeenEmails?: boolean;
  shouldExtractForwardedEmail?: boolean;
  shouldMarkEmailsAsSeen?: boolean;
  shouldStripHiddenElements?: boolean;
}

const DEFAULT_NOTE_TEMPLATE = [
  '---',
  'from: "{{from}}"',
  'to: "{{to}}"',
  'cc: "{{cc}}"',
  'subject: "{{subject}}"',
  'date: {{date}}',
  '---',
  '',
  '{{body}}',
  '',
  '{{attachments}}',
  ''
].join('\n');

const MINIMAL_NOTE_TEMPLATE = [
  '# {{subject}}',
  '',
  'From {{from}} on {{date:YYYY-MM-DD HH:mm}}.',
  '',
  '{{body}}',
  ''
].join('\n');

/**
 * Opens the plugin's own settings tab, where the **Create Mailbox** button lives.
 *
 * Manual equivalent: **Email to Vault: Open settings**, or find the plugin under
 * **Settings -> Community plugins**.
 */
export function openPluginSettings(app: App): void {
  app.commands.executeCommandById(`${PLUGIN_ID}:open-settings`);
}

/**
 * Runs the fetch.
 *
 * It only does something once a mailbox is configured and a message is waiting — the network half is
 * yours, and no button can stand in for it.
 *
 * Manual equivalent: **Email to Vault: Check emails** in the Command Palette.
 */
export function checkEmails(app: App): void {
  app.commands.executeCommandById(`${PLUGIN_ID}:check-emails`);
}

/**
 * Applies a settings patch, live, through the plugin's own settings component.
 *
 * Manual equivalent: edit the same field in **Settings -> Community plugins -> Email to Vault**.
 */
export async function changeSettings(
  app: App,
  patch: DemoSettingsPatch,
  message = 'Applied. Re-run a fetch to see the new format.'
): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: patch });
  new Notice(message);
}

/**
 * Selects the disposable Mail.tm provider, the default — and turns **Delete seen emails** back off, so this
 * is also the reset after trying IMAP mode.
 *
 * Manual equivalent: under **Provider**, set **Email provider** to **Mail.tm**.
 */
export async function useMailTmProvider(app: App): Promise<void> {
  await changeSettings(
    app,
    { emailProviderType: MAIL_TM_PROVIDER, shouldDeleteSeenEmails: false },
    'Email provider: Mail.tm. Register an address in the Mail.tm group of the settings.'
  );
}

/**
 * Selects IMAP and fills in a well-known server: TLS on port 993, reading `INBOX`. Your login and password
 * are left for you to enter.
 *
 * Manual equivalent: under **Provider**, set **Email provider** to **IMAP**, then fill in **Server host**,
 * **Server port**, **Use TLS** and **Mailbox** in the **IMAP** group.
 */
export async function useImapServer(app: App, host: string): Promise<void> {
  if (Platform.isMobile) {
    new Notice('IMAP mode is available on desktop only. Use Mail.tm on mobile.');
    return;
  }

  await changeSettings(
    app,
    { emailProviderType: IMAP_PROVIDER, imapHost: host, imapMailbox: 'INBOX', imapPort: IMAP_TLS_PORT, imapTls: true },
    `Email provider: IMAP, server ${host}. Now enter your email address and password in the settings.`
  );
}

/**
 * Turns **Delete seen emails** on or off.
 *
 * Manual equivalent: the **Delete seen emails** toggle in the plugin's settings.
 */
export async function setDeleteSeenEmails(app: App, isEnabled: boolean): Promise<void> {
  await changeSettings(
    app,
    { shouldDeleteSeenEmails: isEnabled },
    `Delete seen emails: ${isEnabled ? 'on' : 'off'}.`
  );
}

/**
 * Switches to a short, readable note template — the quickest way to see that the template really
 * governs the note, without typing a multi-line value into a text area.
 *
 * Manual equivalent: replace **Email note template** with the same lines.
 */
export async function useMinimalNoteTemplate(app: App): Promise<void> {
  await changeSettings(app, { emailNoteTemplate: MINIMAL_NOTE_TEMPLATE });
}

/**
 * Restores the shipped templates.
 *
 * Manual equivalent: restore **Email note template** and **Email note path template** to their
 * documented defaults.
 */
export async function restoreDefaultTemplates(app: App): Promise<void> {
  await changeSettings(app, {
    emailNotePathTemplate: 'Emails/{{date:YYYY-MM-DD}} {{subject}}',
    emailNoteTemplate: DEFAULT_NOTE_TEMPLATE
  });
}
