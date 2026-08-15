import type { App } from 'obsidian';

import { Notice } from 'obsidian';
import { configureCommunityPlugin } from 'obsidian-dev-utils/obsidian/community-plugins';

// This vault is G98's narrow exception: the feature fetches real mail from a live service over the
// Network, so no button can produce an email for you. What the buttons DO remove is everything either
// Side of that — opening the settings tab, running the fetch, and the multi-line note templates, which
// Are the fiddly part to type and the part worth experimenting with.

const PLUGIN_ID = 'email-to-vault';

interface DemoSettingsPatch {
  emailCheckIntervalInMinutes?: number;
  emailNotePathTemplate?: string;
  emailNoteTemplate?: string;
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
export async function changeSettings(app: App, patch: DemoSettingsPatch): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: patch });
  new Notice('Applied. Re-run a fetch to see the new format.');
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
