import type { App } from 'obsidian';

import { registerAsyncEvent } from 'obsidian-dev-utils/obsidian/components/async-events-component';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';

import type { PluginSettingsComponent } from '../plugin-settings-component.ts';
import type {
  EmailMessageFull,
  EmailMessageSummary
} from './email-provider-types.ts';
import type { EmailProvider } from './email-provider.ts';
import type { MailTmDomainManager } from './mail-tm/mail-tm-domain-manager.ts';

import { EmailProviderType } from './email-provider-type.ts';
import { ImapProviderComponent } from './imap/imap-provider.ts';
import { MailTmProviderComponent } from './mail-tm/mail-tm-provider.ts';

interface EmailProviderManagerComponentConstructorParams {
  readonly app: App;
  readonly mailTmDomainManager: MailTmDomainManager;
  readonly pluginId: string;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

export class EmailProviderManagerComponent extends ComponentEx implements EmailProvider {
  private activeProvider: ComponentEx & EmailProvider | null = null;
  private readonly app: App;
  private readonly mailTmDomainManager: MailTmDomainManager;
  private readonly pluginId: string;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: EmailProviderManagerComponentConstructorParams) {
    super();
    this.app = params.app;
    this.pluginId = params.pluginId;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
    this.mailTmDomainManager = params.mailTmDomainManager;
  }

  public async deleteMessage(messageId: string): Promise<void> {
    return this.getActiveProvider().deleteMessage(messageId);
  }

  public async downloadAttachment(messageId: string, attachmentId: string): Promise<ArrayBuffer> {
    return this.getActiveProvider().downloadAttachment(messageId, attachmentId);
  }

  public getMailTmProvider(): MailTmProviderComponent | null {
    if (this.activeProvider instanceof MailTmProviderComponent) {
      return this.activeProvider;
    }
    return null;
  }

  public async getMessage(messageId: string): Promise<EmailMessageFull> {
    return this.getActiveProvider().getMessage(messageId);
  }

  public async getMessages(): Promise<EmailMessageSummary[]> {
    return this.getActiveProvider().getMessages();
  }

  public async markMessageAsSeen(messageId: string): Promise<void> {
    return this.getActiveProvider().markMessageAsSeen(messageId);
  }

  public override onload(): void {
    super.onload();
    this.activateProvider(this.pluginSettingsComponent.settings.emailProviderType);
    registerAsyncEvent(
      this,
      this.pluginSettingsComponent.on('saveSettings', (newState, oldState) => {
        if (newState.effectiveValues.emailProviderType !== oldState.effectiveValues.emailProviderType) {
          this.activateProvider(newState.effectiveValues.emailProviderType);
        }
      })
    );
  }

  private activateProvider(type: EmailProviderType): void {
    if (this.activeProvider) {
      this.removeChild(this.activeProvider);
      this.activeProvider = null;
    }

    switch (type) {
      case EmailProviderType.Imap:
        this.activeProvider = this.addChild(
          new ImapProviderComponent(this.app, this.pluginSettingsComponent)
        );
        break;
      case EmailProviderType.MailTm:
        this.activeProvider = this.addChild(
          new MailTmProviderComponent(this.app, this.pluginId, this.pluginSettingsComponent, this.mailTmDomainManager)
        );
        break;
      /* v8 ignore start -- Exhaustive check for future enum values. */
      default:
        throw new Error(`Unknown provider type: ${String(type)}`);
        /* v8 ignore stop */
    }
  }

  private getActiveProvider(): EmailProvider {
    if (!this.activeProvider) {
      throw new Error('No active email provider');
    }
    return this.activeProvider;
  }
}
