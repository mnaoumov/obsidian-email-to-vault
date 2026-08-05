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
import type {
  EmailProvider,
  EmailProviderDownloadAttachmentParams
} from '../email-provider.ts';

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

  // eslint-disable-next-line obsidian-dev-utils/params-options-name-match -- Implements the shared EmailProvider interface contract, so the parameter object type is shared across all providers.
  public async downloadAttachment(params: EmailProviderDownloadAttachmentParams): Promise<ArrayBuffer> {
    const { attachmentId, messageId } = params;
    return this.platformImapProvider.downloadAttachment({ attachmentId, messageId });
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
      const desktopModule = await import('./imap-provider-desktop.ts');
      this._platformImapProvider = new desktopModule.ImapProviderDesktopComponent(this.app, this.pluginSettingsComponent);
    } else {
      const mobileModule = await import('./imap-provider-mobile.ts');
      this._platformImapProvider = new mobileModule.ImapProviderMobileComponent(this.pluginNoticeComponent);
    }
  }
}
