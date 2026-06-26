import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { noopAsync } from 'obsidian-dev-utils/function';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';

import type {
  EmailMessageFull,
  EmailMessageSummary
} from '../email-provider-types.ts';
import type { EmailProvider } from '../email-provider.ts';

export class ImapProviderMobileComponent extends ComponentEx implements EmailProvider {
  public constructor(private readonly pluginNoticeComponent: PluginNoticeComponent) {
    super();
  }

  public async deleteMessage(): Promise<void> {
    this.showNotice();
    await noopAsync();
  }

  public async downloadAttachment(): Promise<ArrayBuffer> {
    this.showNotice();
    await noopAsync();
    return new ArrayBuffer(0);
  }

  public async getMessage(messageId: string): Promise<EmailMessageFull> {
    this.showNotice();
    await noopAsync();
    return createEmptyMessageFull(messageId);
  }

  public async getMessages(): Promise<EmailMessageSummary[]> {
    this.showNotice();
    await noopAsync();
    return [];
  }

  public async markMessageAsSeen(): Promise<void> {
    this.showNotice();
    await noopAsync();
  }

  private showNotice(): void {
    this.pluginNoticeComponent.showNotice('IMAP is not available on mobile devices');
  }
}

function createEmptyMessageFull(messageId: string): EmailMessageFull {
  return {
    attachments: [],
    cc: [],
    createdAt: '',
    from: { address: '', name: '' },
    hasAttachments: false,
    html: [],
    id: messageId,
    seen: false,
    subject: '',
    text: '',
    to: []
  };
}
