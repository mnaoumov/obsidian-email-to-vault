import { Notice } from 'obsidian';
import { replace } from 'obsidian-dev-utils/string';

import type {
  MailTmAddress,
  MailTmManager,
  MailTmMessage
} from './mail-tm-manager.ts';
import type { Plugin } from './plugin.ts';

export class EmailChecker {
  private intervalId: null | number = null;

  public constructor(
    private readonly plugin: Plugin,
    private readonly mailTmManager: MailTmManager
  ) {
  }

  public async checkEmails(): Promise<void> {
    const { emailAddress } = this.plugin.settings;
    if (!emailAddress) {
      return;
    }

    new Notice('Checking emails...');

    const messages = await this.mailTmManager.getMessages();
    const unseenMessages = messages.filter((m) => !m.seen);

    if (unseenMessages.length === 0) {
      new Notice('No new emails');
      return;
    }

    for (const message of unseenMessages) {
      await this.saveEmailAsNote(message);
    }

    new Notice(`Saved ${String(unseenMessages.length)} new email(s)`);
  }

  public scheduleCheckEmails(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const checkIntervalInMilliseconds = this.getCheckIntervalInMilliseconds();
    if (checkIntervalInMilliseconds === 0) {
      return;
    }
    this.intervalId = this.plugin.registerInterval(activeWindow.setInterval(this.checkEmails.bind(this), checkIntervalInMilliseconds));
  }

  private async ensureFolderExists(folderPath: string): Promise<void> {
    const folder = this.plugin.app.vault.getFolderByPath(folderPath);
    if (!folder) {
      await this.plugin.app.vault.createFolder(folderPath);
    }
  }

  private getCheckIntervalInMilliseconds(): number {
    const SECONDS_PER_MINUTE = 60;
    const MILLISECONDS_PER_SECOND = 1000;
    const intervalInMinutes = this.plugin.settings.emailCheckIntervalInMinutes;
    return intervalInMinutes * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
  }

  private async saveEmailAsNote(message: MailTmMessage): Promise<void> {
    const fullMessage = await this.mailTmManager.getMessage(message.id);
    const folder = this.plugin.settings.emailNotesFolder;
    const sanitizedSubject = sanitizeFileName(fullMessage.subject || 'Untitled');
    const timestamp = fullMessage.createdAt.replace(/[:.]/g, '-');
    const filePath = `${folder}/${timestamp} ${sanitizedSubject}.md`;

    const template = this.plugin.settings.emailNoteTemplate;
    const content = replace(template, {
      '{{body}}': fullMessage.text,
      '{{cc}}': formatAddresses(fullMessage.cc),
      '{{date}}': fullMessage.createdAt,
      '{{from}}': fullMessage.from.name
        ? `${fullMessage.from.name} <${fullMessage.from.address}>`
        : fullMessage.from.address,
      '{{id}}': fullMessage.id,
      '{{intro}}': fullMessage.intro,
      '{{msgid}}': fullMessage.msgid,
      '{{subject}}': fullMessage.subject,
      '{{to}}': formatAddresses(fullMessage.to)
    });

    await this.ensureFolderExists(folder);
    await this.plugin.app.vault.create(filePath, content);
  }
}

function formatAddresses(addresses: MailTmAddress[]): string {
  return addresses.map((a) => a.name ? `${a.name} <${a.address}>` : a.address).join(', ');
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}
