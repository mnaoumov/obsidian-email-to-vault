import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import {
  App,
  htmlToMarkdown,
  moment as momentLib
} from 'obsidian';
import { extractDefaultExportInterop } from 'obsidian-dev-utils/object-utils';
import { replaceAll } from 'obsidian-dev-utils/string';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type {
  EmailAddress,
  EmailMessageFull,
  EmailMessageSummary
} from './providers/email-provider-types.ts';
import type { EmailProvider } from './providers/email-provider.ts';

const FORWARD_PREFIX_PATTERN = /^(?:Fwd|FW): ?/;

const GMAIL_FORWARD_HEADER_PATTERN = /---------- Forwarded message ---------\s*\r?\n(?:.*\r?\n)*?\s*\r?\n/;

const OUTLOOK_FORWARD_HEADER_PATTERN = /(?:^|\r?\n)From: .*\s*\r?\nSent: .*\s*\r?\nTo: .*\s*\r?\nSubject: .*\s*\r?\n\s*\r?\n/;

const HEADER_FROM_PATTERN = /From: (?<value>.+)/;
const HEADER_SUBJECT_PATTERN = /Subject: (?<value>.+)/;
const HEADER_TO_PATTERN = /To: (?<value>.+)/;
const HEADER_CC_PATTERN = /Cc: (?<value>.+)/;
const HEADER_DATE_PATTERN = /Date: (?<value>.+)/;

interface DownloadAttachmentsResult {
  readonly attachmentLinks: string;
  readonly savedAttachments: Map<string, string>;
}

interface EmailData {
  attachmentsStr: string;
  body: string;
  cc: string;
  dateStr: string;
  from: string;
  subject: string;
  to: string;
}

interface EmailNoteCreatorConstructorParams {
  readonly app: App;
  readonly emailProvider: EmailProvider;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

export class EmailNoteCreator {
  private readonly app: App;
  private readonly emailProvider: EmailProvider;
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: EmailNoteCreatorConstructorParams) {
    this.app = params.app;
    this.emailProvider = params.emailProvider;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public async saveEmailAsNote(message: EmailMessageSummary): Promise<void> {
    const fullMessage = await this.emailProvider.getMessage(message.id);
    const emailData = await this.extractEmailData(fullMessage);
    const basePath = fillTemplate(this.pluginSettingsComponent.settings.emailNotePathTemplate, emailData, true);
    const filePath = this.app.vault.getAvailablePath(basePath, 'md');

    const { attachmentLinks, savedAttachments } = await this.downloadAttachments(fullMessage, filePath);
    emailData.body = replaceInlineAttachmentRefs(emailData.body, savedAttachments);
    emailData.attachmentsStr = attachmentLinks;

    const content = fillTemplate(this.pluginSettingsComponent.settings.emailNoteTemplate, emailData);

    await this.ensureFolderExists(filePath);
    await this.app.vault.create(filePath, content);
  }

  private async downloadAttachments(fullMessage: EmailMessageFull, notePath: string): Promise<DownloadAttachmentsResult> {
    const attachments = fullMessage.attachments;
    if (attachments.length === 0) {
      return { attachmentLinks: '', savedAttachments: new Map() };
    }

    const links: string[] = [];
    const savedAttachments = new Map<string, string>();
    for (const attachment of attachments) {
      const data = await this.emailProvider.downloadAttachment(fullMessage.id, attachment.id);
      const attachmentPath = await this.app.fileManager.getAvailablePathForAttachment(attachment.filename, notePath);
      await this.app.vault.createBinary(attachmentPath, data);
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
    const folder = this.app.vault.getFolderByPath(folderPath);
    if (!folder) {
      await this.app.vault.createFolder(folderPath);
    }
  }

  private async extractEmailData(fullMessage: EmailMessageFull): Promise<EmailData> {
    const fromFormatted = formatAddress(fullMessage.from);
    const toFormatted = formatAddresses(fullMessage.to);
    const ccFormatted = formatAddresses(fullMessage.cc);

    const { body, hadHtmlParseError } = extractBody(fullMessage, {
      shouldStripHiddenElements: this.pluginSettingsComponent.settings.shouldStripHiddenElements
    });

    const data: EmailData = {
      attachmentsStr: '',
      body,
      cc: ccFormatted,
      dateStr: momentFn(fullMessage.createdAt).format(),
      from: fromFormatted,
      subject: fullMessage.subject,
      to: toFormatted
    };

    if (this.pluginSettingsComponent.settings.shouldExtractForwardedEmail) {
      const rfc822Attachment = fullMessage.attachments.find((a) => a.contentType === 'message/rfc822');
      if (rfc822Attachment) {
        const attachmentData = await this.emailProvider.downloadAttachment(fullMessage.id, rfc822Attachment.id);
        const emlContent = new TextDecoder().decode(attachmentData);
        return extractEmailFromRfc822(emlContent);
      }

      const extracted = extractForwardedEmail(data);
      if (hadHtmlParseError) {
        extracted.body = prependHtmlParseError(extracted.body, this.pluginNoticeComponent);
      }
      return extracted;
    }

    if (hadHtmlParseError) {
      data.body = prependHtmlParseError(data.body, this.pluginNoticeComponent);
    }
    return data;
  }
}

function applyHeaderOverrides(data: EmailData, headerBlock: string): void {
  data.from = extractHeaderValue(headerBlock, HEADER_FROM_PATTERN, data.from);
  data.to = extractHeaderValue(headerBlock, HEADER_TO_PATTERN, data.to);
  data.subject = extractHeaderValue(headerBlock, HEADER_SUBJECT_PATTERN, data.subject);
}

const INLINE_ATTACHMENT_PATTERN = /!\[(?<alt>[^\]]*)\]\(attachment:(?<attachId>[^)]+)\)/g;

interface ExtractBodyResult {
  readonly body: string;
  readonly hadHtmlParseError: boolean;
}

interface SanitizeOptions {
  readonly shouldStripHiddenElements: boolean;
}

function extractBody(fullMessage: EmailMessageFull, options: SanitizeOptions): ExtractBodyResult {
  const html = fullMessage.html.join('');
  if (html) {
    try {
      return { body: htmlToMarkdown(sanitizeEmailHtml(html, options)), hadHtmlParseError: false };
    } catch {
      return { body: fullMessage.text, hadHtmlParseError: true };
    }
  }
  return { body: fullMessage.text, hadHtmlParseError: false };
}

const HTML_PARSE_ERROR_MESSAGE = 'ERROR: Could not parse email HTML. Rolling back to text mode';

function extractEmailFromRfc822(emlContent: string): EmailData {
  const headerBodySeparator = /\r?\n\r?\n/;
  const separatorMatch = headerBodySeparator.exec(emlContent);

  const headers = separatorMatch ? emlContent.slice(0, separatorMatch.index) : emlContent;
  const body = separatorMatch ? emlContent.slice(separatorMatch.index + separatorMatch[0].length) : '';

  return {
    attachmentsStr: '',
    body,
    cc: HEADER_CC_PATTERN.exec(headers)?.groups?.['value'] ?? '',
    dateStr: normalizeDate(HEADER_DATE_PATTERN.exec(headers)?.groups?.['value'] ?? ''),
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

  result.subject = replaceAll(result.subject, FORWARD_PREFIX_PATTERN, '');

  const gmailMatch = GMAIL_FORWARD_HEADER_PATTERN.exec(result.body);
  if (gmailMatch) {
    const headerBlock = gmailMatch[0];
    applyHeaderOverrides(result, headerBlock);
    result.dateStr = normalizeDate((HEADER_DATE_PATTERN.exec(headerBlock)?.groups?.['value'] ?? result.dateStr).trim());

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

function extractHeaderValue(text: string, pattern: RegExp, fallback: string): string {
  const raw = pattern.exec(text)?.groups?.['value'];
  if (raw === undefined) {
    return fallback;
  }
  return stripMarkdownFormatting(raw.trim());
}

function formatAddress(address: EmailAddress): string {
  return address.name
    ? `${address.name} <${address.address}>`
    : address.address;
}

function formatAddresses(addresses: EmailAddress[]): string {
  return addresses.map((a) => formatAddress(a)).join(', ');
}

function prependHtmlParseError(body: string, pluginNoticeComponent: PluginNoticeComponent): string {
  pluginNoticeComponent.showNotice(HTML_PARSE_ERROR_MESSAGE);
  return `${HTML_PARSE_ERROR_MESSAGE}\n\n${body}`;
}

function removeHiddenElements(doc: Document): void {
  for (const element of doc.querySelectorAll('[aria-hidden="true"], [style]')) {
    if (element.getAttribute('aria-hidden') === 'true') {
      element.remove();
      continue;
    }

    /* v8 ignore start -- selector [style] guarantees getAttribute returns non-null; ?? is for type safety only. */
    const style = element.getAttribute('style') ?? '';
    /* v8 ignore stop */
    if (checkHiddenByStyle(style)) {
      element.remove();
    }
  }
}

function replaceInlineAttachmentRefs(body: string, savedAttachments: Map<string, string>): string {
  return replaceAll(body, INLINE_ATTACHMENT_PATTERN, ({ capturedGroupArgs: [alt = '', attachId = ''] }) => {
    const savedFilename = savedAttachments.get(attachId);
    if (savedFilename) {
      return `![[${savedFilename}]]`;
    }
    return `![[${alt || 'attachment'}]]`;
  });
}

function sanitizeEmailHtml(html: string, options: SanitizeOptions): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  if (options.shouldStripHiddenElements) {
    removeHiddenElements(doc);
  }

  for (const table of doc.querySelectorAll('table')) {
    if (table.querySelector('tr')) {
      unwrapElement(table);
    } else {
      table.remove();
    }
  }

  for (const element of doc.querySelectorAll('tbody, thead, tfoot, tr, td, th')) {
    unwrapElement(element);
  }

  return doc.body.innerHTML;
}

const HIDDEN_STYLE_PATTERN = /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0/i;

function checkHiddenByStyle(style: string): boolean {
  return HIDDEN_STYLE_PATTERN.test(style);
}

function stripMarkdownFormatting(text: string): string {
  const withoutBold = replaceAll(text, /\*\*(?<content>[^*]+)\*\*/g, ({ capturedGroupArgs: [content] }) => ensureNonNullable(content));
  return replaceAll(withoutBold, /\[(?<label>[^\]]+)\]\([^)]+\)/g, ({ capturedGroupArgs: [label] }) => ensureNonNullable(label));
}

function unwrapElement(element: Element): void {
  const parent = element.parentNode;
  /* v8 ignore start -- querySelectorAll always returns elements with a parent; this guard is defensive only. */
  if (!parent) {
    return;
  }
  /* v8 ignore stop */
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

const momentFn = extractDefaultExportInterop(momentLib);

const KNOWN_DATE_FORMATS = [
  'ddd, MMM D, YYYY [at] h:mm A',
  'ddd, D MMM YYYY'
];

function extractTokenValue(emailData: EmailData, token: string, format: string, isPathTemplate: boolean): string {
  let value: string;
  switch (token) {
    case 'attachments':
      if (format) {
        throw new Error(`Attachments token does not support format: ${format}`);
      }
      if (isPathTemplate) {
        throw new Error('Attachments token is not supported in path template');
      }
      value = emailData.attachmentsStr;
      break;
    case 'body':
      if (format) {
        throw new Error(`Body token does not support format: ${format}`);
      }
      if (isPathTemplate) {
        throw new Error('Body token is not supported in path template');
      }
      value = emailData.body;
      break;
    case 'cc':
      if (format) {
        throw new Error(`CC token does not support format: ${format}`);
      }
      value = emailData.cc;
      break;
    case 'date':
      value = momentFn(emailData.dateStr).format(format);
      break;
    case 'from':
      if (format) {
        throw new Error(`From token does not support format: ${format}`);
      }
      value = emailData.from;
      break;
    case 'subject':
      if (format) {
        throw new Error(`Subject token does not support format: ${format}`);
      }
      value = emailData.subject || (isPathTemplate ? 'Untitled' : '');
      break;
    case 'to':
      if (format) {
        throw new Error(`To token does not support format: ${format}`);
      }
      value = emailData.to;
      break;
    default:
      throw new Error(`Unknown token: ${token}`);
  }
  return isPathTemplate ? sanitizeFileName(value) : value;
}

function fillTemplate(template: string, emailData: EmailData, isPathTemplate = false): string {
  const TOKEN_PATTERN = /\{\{(?<Token>\w+)(?::(?<Format>[^}]+))?\}\}/g;

  return replaceAll(template, TOKEN_PATTERN, ({ capturedGroupArgs: [token = '', format = ''] }) => {
    return extractTokenValue(emailData, token, format, isPathTemplate);
  });
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
  return replaceAll(str, /\s/g, ' ');
}

function sanitizeFileName(name: string): string {
  return replaceAll(name, /[\\/:*?"<>|]/g, '_').trim();
}
