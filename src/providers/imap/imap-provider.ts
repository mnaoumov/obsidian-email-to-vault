import type { App } from 'obsidian';

import { Platform } from 'obsidian';
import { AsyncComponentBase } from 'obsidian-dev-utils/obsidian/components/async-component';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import type { PluginSettingsComponent } from '../../plugin-settings-component.ts';
import type {
  EmailMessageFull,
  EmailMessageSummary
} from '../email-provider-types.ts';
import type { EmailProvider } from '../email-provider.ts';

export class ImapProvider extends AsyncComponentBase implements EmailProvider {
  private _platformImapProvider?: EmailProvider;

  private get platformImapProvider(): EmailProvider {
    return ensureNonNullable(this._platformImapProvider);
  }

  public constructor(
    private readonly app: App,
    private readonly pluginSettingsComponent: PluginSettingsComponent
  ) {
    super();
  }

  public async deleteMessage(messageId: string): Promise<void> {
    await this.platformImapProvider.deleteMessage(messageId);
  }

  public async downloadAttachment(messageId: string, attachmentId: string): Promise<ArrayBuffer> {
    return this.platformImapProvider.downloadAttachment(messageId, attachmentId);
  }

  public async getMessage(messageId: string): Promise<EmailMessageFull> {
    return this.platformImapProvider.getMessage(messageId);
  }

  public async getMessages(): Promise<EmailMessageSummary[]> {
    return this.platformImapProvider.getMessages();
  }

  public async markMessageAsSeen(messageId: string): Promise<void> {
    await this.platformImapProvider.markMessageAsSeen(messageId);
  }

  public override async onload(): Promise<void> {
    if (Platform.isDesktop) {
      // eslint-disable-next-line no-restricted-syntax -- Need conditional import.
      this._platformImapProvider = new (await import('./imap-provider-desktop.ts')).ImapProviderDesktop(this.app, this.pluginSettingsComponent);
    } else {
      // eslint-disable-next-line no-restricted-syntax -- Need conditional import.
      this._platformImapProvider = new (await import('./imap-provider-mobile.ts')).ImapProviderMobile();
    }
  }
}
