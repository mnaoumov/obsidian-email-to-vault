import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';

import { registerAsyncEvent } from '@mnaoumov/obsidian-lib/components/async-events-component';
import { ComponentEx } from '@mnaoumov/obsidian-lib/components/component-ex';
import { convertAsyncToSync } from '@mnaoumov/typescript-lib/async';

import type { EmailCheckStatus } from './email-check-status.ts';
import type { EmailNoteCreator } from './email-note-creator.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type { EmailMessageSummary } from './providers/email-provider-types.ts';
import type { EmailProvider } from './providers/email-provider.ts';

import { INITIAL_EMAIL_CHECK_STATUS } from './email-check-status.ts';
import { EmailProviderAuthenticationError } from './providers/email-provider-authentication-error.ts';
import { EmailProviderRateLimitError } from './providers/email-provider-rate-limit-error.ts';
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
interface ScheduledTransientFailure {
  // What happened, completing "the scheduled email check ...".
  readonly reason: string;
  readonly retryAfterInMilliseconds: null | number;
}
export class EmailCheckerComponent extends ComponentEx {
  private consecutiveScheduledTransientFailures = 0;
  private readonly emailNoteCreator: EmailNoteCreator;
  private readonly emailProvider: EmailProvider;
  private intervalId: null | number = null;
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponent;
  private scheduledTicksToSkip = 0;
  private status = INITIAL_EMAIL_CHECK_STATUS;
  private readonly statusChangedHandlers = new Set<() => void>();

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

  /**
   * Gets the state of the last email check and when the next one is due.
   *
   * @returns The status.
   */
  public getStatus(): EmailCheckStatus {
    return this.status;
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

  /**
   * Calls the handler each time the status changes.
   *
   * @param handler - The handler.
   * @returns A function that stops the calls.
   */
  public onStatusChanged(handler: () => void): () => void {
    this.statusChangedHandlers.add(handler);
    return () => {
      this.statusChangedHandlers.delete(handler);
    };
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
    const tickAt = Date.now();
    const intervalId = this.intervalId;
    try {
      await this.checkEmailsOnScheduleUnguarded();
    } finally {
      // A settings change during the check rescheduled the timer, and that already set the next check.
      if (this.intervalId === intervalId) {
        this.updateStatus({ nextCheckAt: new Date(tickAt + (this.scheduledTicksToSkip + 1) * this.getCheckIntervalInMilliseconds()) });
      }
    }
  }

  private async checkEmailsOnScheduleUnguarded(): Promise<void> {
    if (this.scheduledTicksToSkip > 0) {
      this.scheduledTicksToSkip--;
      return;
    }

    try {
      await this.showAuthenticationErrors(() => this.checkEmailsUnguarded());
    } catch (error) {
      if (error instanceof EmailProviderRateLimitError) {
        this.recordScheduledTransientFailure({
          reason: `was refused by the ${this.getProviderName()} server for asking too often (HTTP 429)`,
          retryAfterInMilliseconds: error.retryAfterInMilliseconds
        });
        return;
      }
      const code = getTransientNetworkErrorCode(error);
      if (code === null) {
        throw error;
      }
      this.recordScheduledTransientFailure({ reason: `could not reach the ${this.getProviderName()} server (${code})`, retryAfterInMilliseconds: null });
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
    this.updateStatus({ isChecking: true });

    let newEmailCount: number;
    try {
      newEmailCount = await this.saveNewEmails();
    } catch (error) {
      this.updateStatus({ isChecking: false, lastCheckAt: new Date(), lastError: this.describeError(error) });
      throw error;
    }

    this.updateStatus({ isChecking: false, lastCheckAt: new Date(), lastError: null, lastNewEmailCount: newEmailCount });

    if (newEmailCount === 0) {
      this.pluginNoticeComponent.showNotice('No new emails');
      return;
    }

    this.pluginNoticeComponent.showNotice(`Saved ${String(newEmailCount)} new email(s)`);
  }

  // The status bar has room for one line, so this names what failed rather than what to do about it.
  private describeError(error: unknown): string {
    if (error instanceof EmailProviderAuthenticationError) {
      return error.message;
    }
    if (error instanceof EmailProviderRateLimitError) {
      return `the ${this.getProviderName()} server refused the request because it was asked too often (HTTP 429)`;
    }
    const code = getTransientNetworkErrorCode(error);
    if (code !== null) {
      return `could not reach the ${this.getProviderName()} server (${code})`;
    }
    return error instanceof Error ? error.message : 'an unexpected error, see the developer console';
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

  // The skip is the backoff, stretched when the server asked for a longer wait than that (`Retry-After`).
  private recordScheduledTransientFailure(failure: ScheduledTransientFailure): void {
    this.consecutiveScheduledTransientFailures++;
    const backoffFactor = Math.min(SCHEDULED_BACKOFF_GROWTH_FACTOR ** (this.consecutiveScheduledTransientFailures - 1), MAX_SCHEDULED_BACKOFF_FACTOR);
    const retryAfterFactor = failure.retryAfterInMilliseconds === null
      ? 0
      : Math.ceil(failure.retryAfterInMilliseconds / this.getCheckIntervalInMilliseconds());
    this.scheduledTicksToSkip = Math.max(backoffFactor, retryAfterFactor) - 1;
    if (this.consecutiveScheduledTransientFailures === 1) {
      console.warn(`Email to Vault: the scheduled email check ${failure.reason}. It will keep trying, less often while the failures last.`);
    }
  }

  private async saveNewEmails(): Promise<number> {
    const settings = this.pluginSettingsComponent.settings;
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

    return newMessages.length;
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
      this.updateStatus({ nextCheckAt: null });
      return;
    }
    this.updateStatus({ nextCheckAt: new Date(Date.now() + intervalInMilliseconds) });
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
      if (error instanceof EmailProviderRateLimitError) {
        this.pluginNoticeComponent.showNotice(
          `The ${this.getProviderName()} server refused the request because it was asked too often (HTTP 429). Try again ${formatRetryAfter(error.retryAfterInMilliseconds)}.`
        );
        return;
      }
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

  private updateStatus(changes: Partial<EmailCheckStatus>): void {
    this.status = { ...this.status, ...changes };
    for (const handler of this.statusChangedHandlers) {
      handler();
    }
  }
}

function formatRetryAfter(retryAfterInMilliseconds: null | number): string {
  const MILLISECONDS_PER_SECOND = 1000;
  if (retryAfterInMilliseconds === null || retryAfterInMilliseconds <= 0) {
    return 'in a moment';
  }
  const seconds = Math.ceil(retryAfterInMilliseconds / MILLISECONDS_PER_SECOND);
  return `in ${String(seconds)} second${seconds === 1 ? '' : 's'}`;
}
