import {
  htmlToMarkdown,
  moment as momentLib
} from 'obsidian';
import { extractDefaultExportInterop } from 'obsidian-dev-utils/object-utils';
import { replace } from 'obsidian-dev-utils/string';

import type {
  MailTmAddress,
  MailTmManager,
  MailTmMessage,
  MailTmMessageFull
} from './mail-tm-manager.ts';
import type { Plugin } from './plugin.ts';

const FORWARD_PREFIX_PATTERN = /^(?:Fwd|FW): ?/;

const GMAIL_FORWARD_HEADER_PATTERN = /---------- Forwarded message ---------\s*\r?\n(?:.*\r?\n)*?\s*\r?\n/;

const OUTLOOK_FORWARD_HEADER_PATTERN = /(?:^|\r?\n)From: .*\s*\r?\nSent: .*\s*\r?\nTo: .*\s*\r?\nSubject: .*\s*\r?\n\s*\r?\n/;

const HEADER_FROM_PATTERN = /From: (?<value>.+)/;
const HEADER_SUBJECT_PATTERN = /Subject: (?<value>.+)/;
const HEADER_TO_PATTERN = /To: (?<value>.+)/;
const HEADER_CC_PATTERN = /Cc: (?<value>.+)/;
const HEADER_DATE_PATTERN = /Date: (?<value>.+)/;

interface DownloadAttachmentsResult {
  attachmentLinks: string;
  savedAttachments: Map<string, string>;
}

interface EmailData {
  body: string;
  cc: string;
  date: string;
  from: string;
  subject: string;
  to: string;
}

export class EmailNoteCreator {
  public constructor(
    private readonly plugin: Plugin,
    private readonly mailTmManager: MailTmManager
  ) {
  }

  public async saveEmailAsNote(message: MailTmMessage): Promise<void> {
    const fullMessage = await this.mailTmManager.getMessage(message.id);
    const emailData = await this.extractEmailData(fullMessage);
    const basePath = this.buildNotePath(emailData);
    const filePath = this.plugin.app.vault.getAvailablePath(basePath, 'md');

    const { attachmentLinks, savedAttachments } = await this.downloadAttachments(fullMessage, filePath);
    const body = replaceInlineAttachmentRefs(emailData.body, savedAttachments);

    const template = this.plugin.settings.emailNoteTemplate;
    const content = replace(template, {
      '{{attachments}}': attachmentLinks,
      '{{body}}': body,
      '{{cc}}': emailData.cc,
      '{{date}}': emailData.date,
      '{{from}}': emailData.from,
      '{{subject}}': emailData.subject,
      '{{to}}': emailData.to
    });

    await this.ensureFolderExists(filePath);
    await this.plugin.app.vault.create(filePath, content);
  }

  private buildNotePath(emailData: EmailData): string {
    const pathTemplate = this.plugin.settings.emailNotePathTemplate;
    return replacePathTemplate(pathTemplate, emailData);
  }

  private async downloadAttachments(fullMessage: MailTmMessageFull, notePath: string): Promise<DownloadAttachmentsResult> {
    const attachments = fullMessage.attachments ?? [];
    if (attachments.length === 0) {
      return { attachmentLinks: '', savedAttachments: new Map() };
    }

    const links: string[] = [];
    const savedAttachments = new Map<string, string>();
    for (const attachment of attachments) {
      const data = await this.mailTmManager.downloadAttachment(fullMessage.id, attachment.id);
      const attachmentPath = await this.plugin.app.fileManager.getAvailablePathForAttachment(attachment.filename, notePath);
      await this.plugin.app.vault.createBinary(attachmentPath, data);
      const filename = extractFilename(attachmentPath);
      links.push(`![[${filename}]]`);
      savedAttachments.set(attachment.id, filename);
    }

    return { attachmentLinks: links.join('\n'), savedAttachments };
  }

  private async ensureFolderExists(filePath: string): Promise<void> {
    const lastSlash = filePath.lastIndexOf('/');
    if (lastSlash === -1) {
      return;
    }
    const folderPath = filePath.slice(0, lastSlash);
    const folder = this.plugin.app.vault.getFolderByPath(folderPath);
    if (!folder) {
      await this.plugin.app.vault.createFolder(folderPath);
    }
  }

  private async extractEmailData(fullMessage: MailTmMessageFull): Promise<EmailData> {
    const fromFormatted = formatAddress(fullMessage.from);
    const toFormatted = formatAddresses(fullMessage.to);
    const ccFormatted = formatAddresses(fullMessage.cc);

    const data: EmailData = {
      body: fullMessage.text,
      cc: ccFormatted,
      date: fullMessage.createdAt,
      from: fromFormatted,
      subject: fullMessage.subject,
      to: toFormatted
    };

    data.body = extractBody(fullMessage);

    if (!this.plugin.settings.shouldExtractForwardedEmail) {
      return data;
    }

    const rfc822Attachment = (fullMessage.attachments ?? []).find((a) => a.contentType === 'message/rfc822');
    if (rfc822Attachment) {
      const attachmentData = await this.mailTmManager.downloadAttachment(fullMessage.id, rfc822Attachment.id);
      const emlContent = new TextDecoder().decode(attachmentData);
      return extractEmailFromRfc822(emlContent);
    }

    return extractForwardedEmail(data);
  }
}

function applyHeaderOverrides(data: EmailData, headerBlock: string): void {
  data.from = extractHeaderValue(headerBlock, HEADER_FROM_PATTERN) ?? data.from;
  data.to = extractHeaderValue(headerBlock, HEADER_TO_PATTERN) ?? data.to;
  data.subject = extractHeaderValue(headerBlock, HEADER_SUBJECT_PATTERN) ?? data.subject;
}

const INLINE_ATTACHMENT_PATTERN = /!\[(?<alt>[^\]]*)\]\(attachment:(?<attachId>[^)]+)\)/g;

function extractBody(fullMessage: MailTmMessageFull): string {
  const html = fullMessage.html.join('');
  if (html) {
    return htmlToMarkdown(html);
  }
  return fullMessage.text;
}

function extractEmailFromRfc822(emlContent: string): EmailData {
  const headerBodySeparator = /\r?\n\r?\n/;
  const separatorMatch = headerBodySeparator.exec(emlContent);

  const headers = separatorMatch ? emlContent.slice(0, separatorMatch.index) : emlContent;
  const body = separatorMatch ? emlContent.slice(separatorMatch.index + separatorMatch[0].length) : '';

  return {
    body,
    cc: HEADER_CC_PATTERN.exec(headers)?.groups?.['value'] ?? '',
    date: normalizeDate(HEADER_DATE_PATTERN.exec(headers)?.groups?.['value'] ?? ''),
    from: HEADER_FROM_PATTERN.exec(headers)?.groups?.['value'] ?? '',
    subject: HEADER_SUBJECT_PATTERN.exec(headers)?.groups?.['value'] ?? '',
    to: HEADER_TO_PATTERN.exec(headers)?.groups?.['value'] ?? ''
  };
}

function extractFilename(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  return lastSlash === -1 ? path : path.slice(lastSlash + 1);
}

function extractForwardedEmail(data: EmailData): EmailData {
  const result = { ...data };

  result.subject = result.subject.replace(FORWARD_PREFIX_PATTERN, '');

  const gmailMatch = GMAIL_FORWARD_HEADER_PATTERN.exec(result.body);
  if (gmailMatch) {
    const headerBlock = gmailMatch[0];
    applyHeaderOverrides(result, headerBlock);
    result.date = normalizeDate((HEADER_DATE_PATTERN.exec(headerBlock)?.groups?.['value'] ?? result.date).trim());

    result.body = result.body.slice(gmailMatch.index + headerBlock.length);
    return result;
  }

  const outlookMatch = OUTLOOK_FORWARD_HEADER_PATTERN.exec(result.body);
  if (outlookMatch) {
    const headerBlock = outlookMatch[0];
    applyHeaderOverrides(result, headerBlock);

    result.body = result.body.slice(outlookMatch.index + headerBlock.length);
    return result;
  }

  return result;
}

function extractHeaderValue(text: string, pattern: RegExp): string | undefined {
  const raw = pattern.exec(text)?.groups?.['value'];
  if (raw === undefined) {
    return undefined;
  }
  return stripMarkdownFormatting(raw.trim());
}

function formatAddress(address: MailTmAddress): string {
  return address.name
    ? `${address.name} <${address.address}>`
    : address.address;
}

function formatAddresses(addresses: MailTmAddress[]): string {
  return addresses.map((a) => formatAddress(a)).join(', ');
}

function replaceInlineAttachmentRefs(body: string, savedAttachments: Map<string, string>): string {
  return body.replace(INLINE_ATTACHMENT_PATTERN, (...args: unknown[]) => {
    const groups = args.at(-1) as Record<string, string>;
    const attachId = groups['attachId'] ?? '';
    const alt = groups['alt'] ?? '';
    const savedFilename = savedAttachments.get(attachId);
    if (savedFilename) {
      return `![[${savedFilename}]]`;
    }
    return `![[${alt || 'attachment'}]]`;
  });
}

function stripMarkdownFormatting(text: string): string {
  return text
    .replace(/\*\*(?<content>[^*]+)\*\*/g, '$<content>')
    .replace(/\[(?<label>[^\]]+)\]\([^)]+\)/g, '$<label>');
}

const momentFn = extractDefaultExportInterop(momentLib);

const KNOWN_DATE_FORMATS = [
  'ddd, MMM D, YYYY [at] h:mm A',
  'ddd, D MMM YYYY'
];

function formatDate(dateStr: string, format: string): string {
  return parseDateStr(dateStr).format(format);
}

function normalizeDate(dateStr: string): string {
  const normalized = normalizeWhitespace(dateStr);
  const parsed = momentFn(normalized, KNOWN_DATE_FORMATS, true);
  if (parsed.isValid()) {
    return parsed.format();
  }
  return dateStr;
}

function normalizeWhitespace(str: string): string {
  return str.replace(/\s/g, ' ');
}

function parseDateStr(dateStr: string): ReturnType<typeof momentFn> {
  const normalized = normalizeWhitespace(dateStr);
  const parsed = momentFn(normalized, KNOWN_DATE_FORMATS, true);
  if (parsed.isValid()) {
    return parsed;
  }
  return momentFn(dateStr);
}

function replacePathTemplate(template: string, emailData: EmailData): string {
  const DATE_TOKEN_PATTERN = /\{\{date:(?<format>[^}]+)\}\}/g;

  let result = template.replace(DATE_TOKEN_PATTERN, (...args: unknown[]) => {
    const groups = args.at(-1) as Record<string, string>;
    return formatDate(emailData.date, groups['format'] ?? '');
  });

  result = replace(result, {
    '{{cc}}': sanitizeFileName(emailData.cc),
    '{{from}}': sanitizeFileName(emailData.from),
    '{{subject}}': sanitizeFileName(emailData.subject || 'Untitled'),
    '{{to}}': sanitizeFileName(emailData.to)
  });

  return result;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}
