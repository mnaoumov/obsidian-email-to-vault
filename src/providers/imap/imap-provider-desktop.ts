import type {
  FetchMessageObject,
  ImapFlowOptions,
  MessageAddressObject,
  MessageStructureObject
} from 'imapflow';
import type { App } from 'obsidian';

import { ComponentEx } from '@mnaoumov/obsidian-lib/components/component-ex';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

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

import { EmailProviderAuthenticationError } from '../email-provider-authentication-error.ts';

interface EnsureMailboxExistsParams {
  readonly client: ImapFlow;
  readonly mailbox: string;
  // The settings label that names the mailbox, so the error says which one to fix.
  readonly settingName: string;
}

// The few `ImapFlowError` fields read here. The package does not export that type from its entry point.
interface ImapFlowErrorLike {
  readonly authenticationFailed?: boolean;
  readonly code?: string;
  readonly response?: unknown;
  readonly responseText?: unknown;
}

export class ImapProviderDesktopComponent extends ComponentEx implements EmailProvider {
  public constructor(
    private readonly app: App,
    private readonly pluginSettingsComponent: PluginSettingsComponent
  ) {
    super();
  }

  // `UID MOVE` keeps the flags, so an unread email stays unread in the archive. The imapflow library falls back to
  // COPY, then `\Deleted` and EXPUNGE, on a server without the MOVE extension.
  public async archiveMessage(messageId: string): Promise<void> {
    const { imapArchiveMailbox, imapMailbox } = this.pluginSettingsComponent.settings;
    await this.withConnection(async (client) => {
      const lock = await client.getMailboxLock(imapMailbox);
      try {
        const result = await client.messageMove(messageId, imapArchiveMailbox, { uid: true });
        if (result === false) {
          throw new Error(
            `The IMAP server would not move the email to the mailbox "${imapArchiveMailbox}". Check that the "Archive mailbox" setting names a folder that exists.`
          );
        }
      } finally {
        lock.release();
      }
    });
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

  // eslint-disable-next-line typescript-dev-toolkit/params-options-name-match -- Implements the shared EmailProvider interface contract, so the parameter object type is shared across all providers.
  public async downloadAttachment(params: EmailProviderDownloadAttachmentParams): Promise<ArrayBuffer> {
    const { attachmentId, messageId } = params;
    return this.withConnection(async (client) => {
      const lock = await client.getMailboxLock(this.pluginSettingsComponent.settings.imapMailbox);
      try {
        const downloadResult = await client.download(messageId, attachmentId, { uid: true });
        if (!downloadResult.content) {
          throw new Error(`Attachment ${attachmentId} of message ${messageId} not found`);
        }
        return await streamToArrayBuffer(downloadResult.content);
      } finally {
        lock.release();
      }
    });
  }

  public async downloadMessageSource(messageId: string): Promise<ArrayBuffer> {
    return this.withConnection(async (client) => {
      const lock = await client.getMailboxLock(this.pluginSettingsComponent.settings.imapMailbox);
      try {
        const message = await client.fetchOne(messageId, { source: true }, { uid: true });
        if (!message || !message.source) {
          throw new Error(`Message ${messageId} not found`);
        }
        return bufferToArrayBuffer(message.source);
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
        // The imapflow library sends `1:*` verbatim, and an empty mailbox has no message 1 for it
        // to name, so servers such as Dovecot reject it as an invalid message set, which imapflow
        // raises as `Command failed`. SELECT already told us the count, so an empty mailbox skips
        // FETCH. Gmail tolerates the empty range, which is why the integration suite never saw it.
        if (client.mailbox && client.mailbox.exists === 0) {
          return [];
        }
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

  // Asking `STATUS` of the configured mailbox proves more than the login: a wrong mailbox name fails here too, rather
  // than at the next check. It reads counts only, so no message is fetched, flagged or moved.
  // The archive mailbox, when set, is checked the same way, since a missing one would fail only after the first note.
  public async testConnection(): Promise<void> {
    const { imapArchiveMailbox, imapMailbox } = this.pluginSettingsComponent.settings;
    await this.withConnection(async (client) => {
      await ensureMailboxExists({ client, mailbox: imapMailbox, settingName: 'Mailbox' });
      if (imapArchiveMailbox) {
        await ensureMailboxExists({ client, mailbox: imapArchiveMailbox, settingName: 'Archive mailbox' });
      }
    });
  }

  private async withConnection<T>(callback: (client: ImapFlow) => Promise<T>): Promise<T> {
    const settings = this.pluginSettingsComponent.settings;
    const password = this.app.secretStorage.getSecret(settings.emailPasswordSecretKey);

    if (!settings.emailAddress || !password) {
      throw new EmailProviderAuthenticationError(
        'Email address or password not configured. Enter both in the IMAP section of the plugin settings.'
      );
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

    try {
      await client.connect();
    } catch (error) {
      // A rejected login is something the user fixes in the settings, so it is said in their words and shown, rather
      // than left in the console as a bare `Command failed`.
      if ((error as ImapFlowErrorLike).authenticationFailed) {
        throw new EmailProviderAuthenticationError(
          `The IMAP server ${settings.imapHost} rejected the login for ${settings.emailAddress}${formatServerText(error)}. Check the email address and password in the plugin settings.`,
          { cause: error }
        );
      }
      throw error;
    }
    try {
      return await callback(client);
    } finally {
      await client.logout();
    }
  }
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  // Copies the bytes: a small Buffer is a view into Node's shared pool, so its own `buffer` holds other data around it.
  return new Uint8Array(buffer).buffer;
}

function checkHasAttachments(bodyStructure?: MessageStructureObject): boolean {
  if (!bodyStructure) {
    return false;
  }
  if (bodyStructure.disposition === 'attachment') {
    return true;
  }
  return !!bodyStructure.childNodes && bodyStructure.childNodes.some((child) => checkHasAttachments(child));
}

function collectAttachments(bodyStructure?: MessageStructureObject): EmailAttachment[] {
  if (!bodyStructure) {
    return [];
  }
  const attachments: EmailAttachment[] = [];
  walkBodyStructure(bodyStructure, attachments);
  return attachments;
}

async function ensureMailboxExists(params: EnsureMailboxExistsParams): Promise<void> {
  const { client, mailbox, settingName } = params;
  let status: Awaited<ReturnType<ImapFlow['status']>>;
  try {
    status = await client.status(mailbox, { messages: true });
  } catch (error) {
    // `status()` raises `NotFound` only after a `LIST` confirmed that the mailbox does not exist.
    if ((error as ImapFlowErrorLike).code === 'NotFound') {
      throw new Error(`The IMAP server has no mailbox named "${mailbox}". Check the "${settingName}" setting.`, { cause: error });
    }
    throw error;
  }
  if (status === false) {
    throw new Error(`The IMAP server accepted the login but would not report on the mailbox "${mailbox}".`);
  }
}

// What the server said when it refused, as `: "<text>"`, or nothing when it said nothing readable. A rejected
// `LOGIN` carries the text as `responseText`; an `AUTHENTICATE` failure carries it as a string `response`.
function formatServerText(error: unknown): string {
  const { response, responseText } = error as ImapFlowErrorLike;
  let text = '';
  if (typeof responseText === 'string') {
    text = responseText;
  } else if (typeof response === 'string') {
    text = response;
  }
  text = text.trim();
  return text ? `: "${text}"` : '';
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
  return bufferToArrayBuffer(Buffer.concat(chunks));
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
