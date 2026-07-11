import type {
  FetchMessageObject,
  ImapFlowOptions,
  MessageAddressObject,
  MessageStructureObject
} from 'imapflow';
import type { App } from 'obsidian';

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';

import type { PluginSettingsComponent } from '../../plugin-settings-component.ts';
import type {
  EmailAddress,
  EmailAttachment,
  EmailMessageFull,
  EmailMessageSummary
} from '../email-provider-types.ts';
import type {
  EmailProvider,
  EmailProviderDownloadAttachmentParams
} from '../email-provider.ts';

export class ImapProviderDesktopComponent extends ComponentEx implements EmailProvider {
  public constructor(
    private readonly app: App,
    private readonly pluginSettingsComponent: PluginSettingsComponent
  ) {
    super();
  }

  public async deleteMessage(messageId: string): Promise<void> {
    await this.withConnection(async (client) => {
      const lock = await client.getMailboxLock(this.pluginSettingsComponent.settings.imapMailbox);
      try {
        await client.messageDelete(messageId, { uid: true });
      } finally {
        lock.release();
      }
    });
  }

  // eslint-disable-next-line obsidian-dev-utils/params-options-name-match -- Implements the shared EmailProvider interface contract, so the parameter object type is shared across all providers.
  public async downloadAttachment(params: EmailProviderDownloadAttachmentParams): Promise<ArrayBuffer> {
    const { attachmentId, messageId } = params;
    return this.withConnection(async (client) => {
      const lock = await client.getMailboxLock(this.pluginSettingsComponent.settings.imapMailbox);
      try {
        const downloadResult = await client.download(messageId, attachmentId, { uid: true });
        return await streamToArrayBuffer(downloadResult.content);
      } finally {
        lock.release();
      }
    });
  }

  public async getMessage(messageId: string): Promise<EmailMessageFull> {
    return this.withConnection(async (client) => {
      const lock = await client.getMailboxLock(this.pluginSettingsComponent.settings.imapMailbox);
      try {
        const msg = await client.fetchOne(messageId, { bodyStructure: true, envelope: true, flags: true, source: true }, { uid: true });
        if (!msg) {
          throw new Error(`Message ${messageId} not found`);
        }
        const parsed = await simpleParser(msg.source ?? Buffer.alloc(0));
        const attachments = collectAttachments(msg.bodyStructure);
        return {
          attachments,
          cc: mapAddresses(msg.envelope?.cc),
          createdAt: msg.envelope?.date?.toISOString() ?? '',
          from: mapAddress(msg.envelope?.from?.[0]),
          hasAttachments: attachments.length > 0,
          html: parsed.html ? [parsed.html] : [],
          id: String(msg.uid),
          seen: msg.flags?.has('\\Seen') ?? false,
          subject: msg.envelope?.subject ?? '',
          text: parsed.text ?? '',
          to: mapAddresses(msg.envelope?.to)
        };
      } finally {
        lock.release();
      }
    });
  }

  public async getMessages(): Promise<EmailMessageSummary[]> {
    return this.withConnection(async (client) => {
      const lock = await client.getMailboxLock(this.pluginSettingsComponent.settings.imapMailbox);
      try {
        const messages: EmailMessageSummary[] = [];
        for await (const msg of client.fetch('1:*', { bodyStructure: true, envelope: true, flags: true, uid: true })) {
          messages.push(mapFetchToSummary(msg));
        }
        return messages;
      } finally {
        lock.release();
      }
    });
  }

  public async markMessageAsSeen(messageId: string): Promise<void> {
    await this.withConnection(async (client) => {
      const lock = await client.getMailboxLock(this.pluginSettingsComponent.settings.imapMailbox);
      try {
        await client.messageFlagsAdd(messageId, ['\\Seen'], { uid: true });
      } finally {
        lock.release();
      }
    });
  }

  private async withConnection<T>(callback: (client: ImapFlow) => Promise<T>): Promise<T> {
    const settings = this.pluginSettingsComponent.settings;
    const password = this.app.secretStorage.getSecret(settings.emailPasswordSecretKey);

    if (!settings.emailAddress || !password) {
      throw new Error('Email address or password not configured');
    }

    const options: ImapFlowOptions = {
      auth: {
        pass: password,
        user: settings.emailAddress
      },
      host: settings.imapHost,
      logger: false,
      port: settings.imapPort,
      secure: settings.imapTls
    };
    const client = new ImapFlow(options);

    await client.connect();
    try {
      return await callback(client);
    } finally {
      await client.logout();
    }
  }
}

function checkHasAttachments(bodyStructure?: MessageStructureObject): boolean {
  if (!bodyStructure) {
    return false;
  }
  if (bodyStructure.disposition === 'attachment') {
    return true;
  }
  if (bodyStructure.childNodes) {
    return bodyStructure.childNodes.some((child) => checkHasAttachments(child));
  }
  return false;
}

function collectAttachments(bodyStructure?: MessageStructureObject): EmailAttachment[] {
  if (!bodyStructure) {
    return [];
  }
  const attachments: EmailAttachment[] = [];
  walkBodyStructure(bodyStructure, attachments);
  return attachments;
}

function mapAddress(addr?: MessageAddressObject): EmailAddress {
  return {
    address: addr?.address ?? '',
    name: addr?.name ?? ''
  };
}

function mapAddresses(addresses?: MessageAddressObject[]): EmailAddress[] {
  return addresses?.map((a) => mapAddress(a)) ?? [];
}

function mapFetchToSummary(msg: FetchMessageObject): EmailMessageSummary {
  const hasAttachments = checkHasAttachments(msg.bodyStructure);
  return {
    createdAt: msg.envelope?.date?.toISOString() ?? '',
    from: mapAddress(msg.envelope?.from?.[0]),
    hasAttachments,
    id: String(msg.uid),
    seen: msg.flags?.has('\\Seen') ?? false,
    subject: msg.envelope?.subject ?? '',
    to: mapAddresses(msg.envelope?.to)
  };
}

async function streamToArrayBuffer(stream: AsyncIterable<Buffer>): Promise<ArrayBuffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function walkBodyStructure(node: MessageStructureObject, attachments: EmailAttachment[]): void {
  if (node.disposition === 'attachment' && node.part) {
    attachments.push({
      contentType: node.type,
      filename: node.dispositionParameters?.['filename'] ?? node.parameters?.['name'] ?? 'attachment',
      id: node.part
    });
  }
  if (node.childNodes) {
    for (const child of node.childNodes) {
      walkBodyStructure(child, attachments);
    }
  }
}
