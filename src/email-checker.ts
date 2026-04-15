import { Notice } from 'obsidian';

import type { EmailNoteCreator } from './email-note-creator.ts';
import type { MailTmManager } from './mail-tm-manager.ts';
import type { Plugin } from './plugin.ts';

export class EmailChecker {
  private intervalId: null | number = null;

  public constructor(
    private readonly plugin: Plugin,
    private readonly mailTmManager: MailTmManager,
    private readonly noteCreator: EmailNoteCreator
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
      await this.noteCreator.saveEmailAsNote(message);
      if (this.plugin.settings.shouldDeleteSeenEmails) {
        await this.mailTmManager.deleteMessage(message.id);
      } else {
        await this.mailTmManager.markMessageAsSeen(message.id);
      }
    }

    new Notice(`Saved ${String(unseenMessages.length)} new email(s)`);
  }

  public async redownloadEmails(count?: number): Promise<void> {
    const messages = await this.mailTmManager.getMessages();
    const toProcess = count ? messages.slice(0, count) : messages;
    for (const message of toProcess) {
      await this.noteCreator.saveEmailAsNote(message);
    }
    new Notice(`Redownloaded ${String(toProcess.length)} email(s)`);
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

  private getCheckIntervalInMilliseconds(): number {
    const SECONDS_PER_MINUTE = 60;
    const MILLISECONDS_PER_SECOND = 1000;
    const intervalInMinutes = this.plugin.settings.emailCheckIntervalInMinutes;
    return intervalInMinutes * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
  }
}
