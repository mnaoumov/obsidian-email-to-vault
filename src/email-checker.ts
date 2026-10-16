import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';

import { registerAsyncEvent } from '@mnaoumov/obsidian-lib/components/async-events-component';
import { ComponentEx } from '@mnaoumov/obsidian-lib/components/component-ex';
import { convertAsyncToSync } from '@mnaoumov/typescript-lib/async';

import type { EmailNoteCreator } from './email-note-creator.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type { EmailMessageSummary } from './providers/email-provider-types.ts';
import type { EmailProvider } from './providers/email-provider.ts';

import { EmailProviderAuthenticationError } from './providers/email-provider-authentication-error.ts';

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
    await this.showAuthenticationErrors(() => this.checkEmailsUnguarded());
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
    await this.showAuthenticationErrors(async () => {
      const messages = await this.emailProvider.getMessages();
      const toProcess = count ? messages.slice(0, count) : messages;
      for (const message of toProcess) {
        await this.emailNoteCreator.saveEmailAsNote(message);
      }
      this.pluginNoticeComponent.showNotice(`Redownloaded ${String(toProcess.length)} email(s)`);
    });
  }

  private async checkEmailsUnguarded(): Promise<void> {
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
    return isTimestampMode && lastProcessedEmailTimestamp ? messages.filter((m) => m.createdAt > lastProcessedEmailTimestamp) : messages.filter((m) => !m.seen);
  }

  // A command's thrown error reaches the console only, so a password the service rejects showed the user nothing after
  // "Checking emails..." (#10). Its message says what to do, so it is shown instead; any other error still propagates.
  private async showAuthenticationErrors(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (!(error instanceof EmailProviderAuthenticationError)) {
        throw error;
      }
      this.pluginNoticeComponent.showNotice(error.message);
    }
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
