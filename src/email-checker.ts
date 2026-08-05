import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { registerAsyncEvent } from 'obsidian-dev-utils/obsidian/components/async-events-component';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';

import type { EmailNoteCreator } from './email-note-creator.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type { EmailMessageSummary } from './providers/email-provider-types.ts';
import type { EmailProvider } from './providers/email-provider.ts';

interface EmailCheckerComponentConstructorParams {
  readonly emailNoteCreator: EmailNoteCreator;
  readonly emailProvider: EmailProvider;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}
export class EmailCheckerComponent extends ComponentEx {
  private readonly emailNoteCreator: EmailNoteCreator;
  private readonly emailProvider: EmailProvider;
  private intervalId: null | number = null;
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: EmailCheckerComponentConstructorParams) {
    super();
    this.pluginNoticeComponent = params.pluginNoticeComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
    this.emailProvider = params.emailProvider;
    this.emailNoteCreator = params.emailNoteCreator;
  }

  public async checkEmails(): Promise<void> {
    const settings = this.pluginSettingsComponent.settings;
    if (!settings.emailAddress) {
      return;
    }

    this.pluginNoticeComponent.showNotice('Checking emails...');

    const messages = await this.emailProvider.getMessages();
    const isTimestampMode = !settings.shouldMarkEmailsAsSeen && !settings.shouldDeleteSeenEmails;
    const newMessages = this.selectNewMessages(messages, isTimestampMode);

    for (const message of newMessages) {
      await this.emailNoteCreator.saveEmailAsNote(message);
      if (settings.shouldDeleteSeenEmails) {
        await this.emailProvider.deleteMessage(message.id);
      } else if (settings.shouldMarkEmailsAsSeen) {
        await this.emailProvider.markMessageAsSeen(message.id);
      }
    }

    if (isTimestampMode) {
      await this.updateLastProcessedTimestamp(messages);
    }

    if (newMessages.length === 0) {
      this.pluginNoticeComponent.showNotice('No new emails');
      return;
    }

    this.pluginNoticeComponent.showNotice(`Saved ${String(newMessages.length)} new email(s)`);
  }

  public override onload(): void {
    super.onload();
    this.scheduleCheckEmails();
    registerAsyncEvent(
      this,
      this.pluginSettingsComponent.on('saveSettings', (newState, oldState) => {
        if (newState.effectiveValues.emailCheckIntervalInMinutes !== oldState.effectiveValues.emailCheckIntervalInMinutes) {
          this.scheduleCheckEmails();
        }
      })
    );
  }

  public async redownloadEmails(count?: number): Promise<void> {
    const messages = await this.emailProvider.getMessages();
    const toProcess = count ? messages.slice(0, count) : messages;
    for (const message of toProcess) {
      await this.emailNoteCreator.saveEmailAsNote(message);
    }
    this.pluginNoticeComponent.showNotice(`Redownloaded ${String(toProcess.length)} email(s)`);
  }

  private getCheckIntervalInMilliseconds(): number {
    const SECONDS_PER_MINUTE = 60;
    const MILLISECONDS_PER_SECOND = 1000;
    const intervalInMinutes = this.pluginSettingsComponent.settings.emailCheckIntervalInMinutes;
    return intervalInMinutes * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
  }

  private scheduleCheckEmails(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const intervalInMilliseconds = this.getCheckIntervalInMilliseconds();
    if (intervalInMilliseconds === 0) {
      return;
    }
    this.intervalId = this.pluginSettingsComponent.registerInterval(
      window.setInterval(convertAsyncToSync(this.checkEmails.bind(this)), intervalInMilliseconds)
    );
  }

  private selectNewMessages(messages: EmailMessageSummary[], isTimestampMode: boolean): EmailMessageSummary[] {
    const { lastProcessedEmailTimestamp } = this.pluginSettingsComponent.settings;
    if (isTimestampMode && lastProcessedEmailTimestamp) {
      return messages.filter((m) => m.createdAt > lastProcessedEmailTimestamp);
    }
    return messages.filter((m) => !m.seen);
  }

  private async updateLastProcessedTimestamp(messages: EmailMessageSummary[]): Promise<void> {
    const currentTimestamp = this.pluginSettingsComponent.settings.lastProcessedEmailTimestamp;
    let newTimestamp = currentTimestamp;
    for (const message of messages) {
      if (message.createdAt > newTimestamp) {
        newTimestamp = message.createdAt;
      }
    }

    if (newTimestamp === currentTimestamp) {
      return;
    }

    await this.pluginSettingsComponent.editAndSave((settings) => {
      settings.lastProcessedEmailTimestamp = newTimestamp;
    });
  }
}
