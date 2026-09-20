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
        const message = await client.fetchOne(messageId, { bodyStructure: true, envelope: true, flags: true, internalDate: true, source: true }, { uid: true });
        if (!message) {
          throw new Error(`Message ${messageId} not found`);
        }
        const parsed = await simpleParser(message.source ?? Buffer.alloc(0));
        const attachments = collectAttachments(message.bodyStructure);
        return {
          attachments,
          cc: mapAddresses(message.envelope?.cc),
          createdAt: mapCreatedAt(message),
          from: mapAddress(message.envelope?.from?.[0]),
          hasAttachments: attachments.length > 0,
          html: parsed.html ? [parsed.html] : [],
          id: String(message.uid),
          seen: message.flags?.has(String.raw`\Seen`) ?? false,
          subject: message.envelope?.subject ?? '',
          text: parsed.text ?? '',
          to: mapAddresses(message.envelope?.to)
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
        for await (const message of client.fetch('1:*', { bodyStructure: true, envelope: true, flags: true, internalDate: true, uid: true })) {
          messages.push(mapFetchToSummary(message));
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
        await client.messageFlagsAdd(messageId, [String.raw`\Seen`], { uid: true });
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
  return bodyStructure.childNodes ? bodyStructure.childNodes.some((child) => checkHasAttachments(child)) : false;
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

function mapCreatedAt(message: FetchMessageObject): string {
  // The sender's `Date` header is what a reader means by the date of an email, so the envelope
  // wins whenever it parses. When it does not, INTERNALDATE - the time the server accepted the
  // message, which IMAP always carries - is a worse answer but a real one, and the difference
  // matters beyond the rendered `{{date}}`: `createdAt` is the bookmark `email-checker` compares
  // against with `>`, and `''` loses that comparison to every real timestamp, so an empty date is
  // not an undated import but no import at all. Both dates missing leaves `''`, which takes a
  // message with no readable header on a server that recorded no receipt time.
  return mapImapDate(message.envelope?.date) || mapImapDate(message.internalDate);
}

function mapFetchToSummary(message: FetchMessageObject): EmailMessageSummary {
  const hasAttachments = checkHasAttachments(message.bodyStructure);
  return {
    createdAt: mapCreatedAt(message),
    from: mapAddress(message.envelope?.from?.[0]),
    hasAttachments,
    id: String(message.uid),
    seen: message.flags?.has(String.raw`\Seen`) ?? false,
    subject: message.envelope?.subject ?? '',
    to: mapAddresses(message.envelope?.to)
  };
}

function mapImapDate(date?: Date | string): string {
  // Since imapflow 2 a date is the raw string whenever the library's own `new Date(...)` on it
  // came back invalid - true of `envelope.date` and of `internalDate` alike, which is why one
  // helper serves both - so every call site has to narrow the union before reaching for
  // `toISOString`, which throws on an invalid date rather than returning anything. A value that
  // parses nowhere becomes the empty string, never the raw text: `createdAt` is compared
  // lexicographically against the last-processed bookmark, so a non-ISO value would order
  // arbitrarily against every real one.
  const parsedDate = date instanceof Date ? date : new Date(date ?? '');
  return Number.isNaN(parsedDate.getTime()) ? '' : parsedDate.toISOString();
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
