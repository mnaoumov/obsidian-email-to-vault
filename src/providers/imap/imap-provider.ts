import type { App } from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { Platform } from 'obsidian';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import type { PluginSettingsComponent } from '../../plugin-settings-component.ts';
import type {
  EmailMessageFull,
  EmailMessageSummary
} from '../email-provider-types.ts';
import type { EmailProvider } from '../email-provider.ts';

interface ImapProviderComponentConstructorParams {
  readonly app: App;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

export class ImapProviderComponent extends ComponentEx implements EmailProvider {
  private _platformImapProvider?: EmailProvider;
  private readonly app: App;
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  private get platformImapProvider(): EmailProvider {
    return ensureNonNullable(this._platformImapProvider);
  }

  public constructor(params: ImapProviderComponentConstructorParams) {
    super();
    this.app = params.app;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
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

  public override async onloadAsync(): Promise<void> {
    if (Platform.isDesktop) {
      // eslint-disable-next-line no-restricted-syntax -- Need conditional import.
      this._platformImapProvider = new (await import('./imap-provider-desktop.ts')).ImapProviderDesktopComponent(this.app, this.pluginSettingsComponent);
    } else {
      // eslint-disable-next-line no-restricted-syntax -- Need conditional import.
      this._platformImapProvider = new (await import('./imap-provider-mobile.ts')).ImapProviderMobileComponent(this.pluginNoticeComponent);
    }
  }
}
