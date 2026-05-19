import {
  Component,
  Notice
} from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { registerAsyncEvent } from 'obsidian-dev-utils/obsidian/components/async-events-component';

import type { EmailNoteCreator } from './email-note-creator.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type { EmailProvider } from './providers/email-provider.ts';

interface EmailCheckerComponentConstructorParams {
  readonly emailNoteCreator: EmailNoteCreator;
  readonly emailProvider: EmailProvider;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}
export class EmailCheckerComponent extends Component {
  private readonly emailNoteCreator: EmailNoteCreator;
  private readonly emailProvider: EmailProvider;
  private intervalId: null | number = null;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: EmailCheckerComponentConstructorParams) {
    super();
    this.pluginSettingsComponent = params.pluginSettingsComponent;
    this.emailProvider = params.emailProvider;
    this.emailNoteCreator = params.emailNoteCreator;
  }

  public async checkEmails(): Promise<void> {
    const { emailAddress } = this.pluginSettingsComponent.settings;
    if (!emailAddress) {
      return;
    }

    new Notice('Checking emails...');

    const messages = await this.emailProvider.getMessages();
    const unseenMessages = messages.filter((m) => !m.seen);

    if (unseenMessages.length === 0) {
      new Notice('No new emails');
      return;
    }

    for (const message of unseenMessages) {
      await this.emailNoteCreator.saveEmailAsNote(message);
      if (this.pluginSettingsComponent.settings.shouldDeleteSeenEmails) {
        await this.emailProvider.deleteMessage(message.id);
      } else {
        await this.emailProvider.markMessageAsSeen(message.id);
      }
    }

    new Notice(`Saved ${String(unseenMessages.length)} new email(s)`);
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
    new Notice(`Redownloaded ${String(toProcess.length)} email(s)`);
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

    const checkIntervalInMilliseconds = this.getCheckIntervalInMilliseconds();
    if (checkIntervalInMilliseconds === 0) {
      return;
    }
    this.intervalId = this.pluginSettingsComponent.registerInterval(
      window.setInterval(convertAsyncToSync(this.checkEmails.bind(this)), checkIntervalInMilliseconds)
    );
  }
}
