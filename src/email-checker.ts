import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';

import { registerAsyncEvent } from '@mnaoumov/obsidian-lib/components/async-events-component';
import { ComponentEx } from '@mnaoumov/obsidian-lib/components/component-ex';
import { convertAsyncToSync } from '@mnaoumov/typescript-lib/async';

import type { EmailNoteCreator } from './email-note-creator.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type { EmailMessageSummary } from './providers/email-provider-types.ts';
import type { EmailProvider } from './providers/email-provider.ts';

import { EmailProviderAuthenticationError } from './providers/email-provider-authentication-error.ts';
import { EmailProviderType } from './providers/email-provider-type.ts';
import { getTransientNetworkErrorCode } from './transient-network-error.ts';

// Each further transient failure in a row multiplies the gap between scheduled checks by this factor, up to the maximum.
const SCHEDULED_BACKOFF_GROWTH_FACTOR = 2;
// Repeated transient failures stretch the scheduled check to at most this many intervals apart.
const MAX_SCHEDULED_BACKOFF_FACTOR = 8;

interface EmailCheckerComponentConstructorParams {
  readonly emailNoteCreator: EmailNoteCreator;
  readonly emailProvider: EmailProvider;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}
export class EmailCheckerComponent extends ComponentEx {
  private consecutiveScheduledTransientFailures = 0;
  private readonly emailNoteCreator: EmailNoteCreator;
  private readonly emailProvider: EmailProvider;
  private intervalId: null | number = null;
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponent;
  private scheduledTicksToSkip = 0;

  public constructor(params: EmailCheckerComponentConstructorParams) {
    super();
    this.pluginNoticeComponent = params.pluginNoticeComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
    this.emailProvider = params.emailProvider;
    this.emailNoteCreator = params.emailNoteCreator;
  }

  /**
   * Checks for new emails on the user's request: every failure the user can act on is shown as a notice.
   */
  public async checkEmails(): Promise<void> {
    await this.showExpectedErrors(() => this.checkEmailsUnguarded());
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
    await this.showExpectedErrors(async () => {
      const messages = await this.emailProvider.getMessages();
      const toProcess = count ? messages.slice(0, count) : messages;
      for (const message of toProcess) {
        await this.emailNoteCreator.saveEmailAsNote(message);
      }
      this.pluginNoticeComponent.showNotice(`Redownloaded ${String(toProcess.length)} email(s)`);
    });
  }

  // A scheduled check that hits a dropped connection is not an error: it logs one warning per run of failures, shows
  // no notice, and the next tick tries again. Repeated failures back off, so an offline device is not polled at the
  // full rate. Authentication errors are still shown, and any other error still propagates.
  private async checkEmailsOnSchedule(): Promise<void> {
    if (this.scheduledTicksToSkip > 0) {
      this.scheduledTicksToSkip--;
      return;
    }

    try {
      await this.showAuthenticationErrors(() => this.checkEmailsUnguarded());
    } catch (error) {
      const code = getTransientNetworkErrorCode(error);
      if (code === null) {
        throw error;
      }
      this.recordScheduledTransientFailure(code);
      return;
    }

    this.consecutiveScheduledTransientFailures = 0;
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

  private getProviderName(): string {
    return this.pluginSettingsComponent.settings.emailProviderType === EmailProviderType.Imap ? 'IMAP' : 'Mail.tm';
  }

  private recordScheduledTransientFailure(code: string): void {
    this.consecutiveScheduledTransientFailures++;
    const backoffFactor = Math.min(SCHEDULED_BACKOFF_GROWTH_FACTOR ** (this.consecutiveScheduledTransientFailures - 1), MAX_SCHEDULED_BACKOFF_FACTOR);
    this.scheduledTicksToSkip = backoffFactor - 1;
    if (this.consecutiveScheduledTransientFailures === 1) {
      console.warn(
        `Email to Vault: the scheduled email check could not reach the ${this.getProviderName()} server (${code}). It will keep trying, less often while the failures last.`
      );
    }
  }

  private scheduleCheckEmails(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.consecutiveScheduledTransientFailures = 0;
    this.scheduledTicksToSkip = 0;

    const intervalInMilliseconds = this.getCheckIntervalInMilliseconds();
    if (intervalInMilliseconds === 0) {
      return;
    }
    this.intervalId = this.pluginSettingsComponent.registerInterval(
      window.setInterval(convertAsyncToSync(this.checkEmailsOnSchedule.bind(this)), intervalInMilliseconds)
    );
  }

  private selectNewMessages(messages: EmailMessageSummary[], isTimestampMode: boolean): EmailMessageSummary[] {
    const { lastProcessedEmailTimestamp } = this.pluginSettingsComponent.settings;
    return messages.filter(isTimestampMode && lastProcessedEmailTimestamp ? (m): boolean => m.createdAt > lastProcessedEmailTimestamp : (m): boolean => !m.seen);
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

  // A command the user ran must say that it failed, and a dropped connection is not a bug to leave in the console.
  private async showExpectedErrors(action: () => Promise<void>): Promise<void> {
    try {
      await this.showAuthenticationErrors(action);
    } catch (error) {
      const code = getTransientNetworkErrorCode(error);
      if (code === null) {
        throw error;
      }
      this.pluginNoticeComponent.showNotice(
        `Could not reach the ${this.getProviderName()} server (${code}). Check your internet connection and try again.`
      );
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
