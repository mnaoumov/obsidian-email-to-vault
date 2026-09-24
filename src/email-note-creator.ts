import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import {
  App,
  htmlToMarkdown,
  moment as momentLib
} from 'obsidian';
import { extractDefaultExportInterop } from 'obsidian-dev-utils/object-utils';
import { getOsAndObsidianUnsafePathCharsRegExp } from 'obsidian-dev-utils/obsidian/validation';
import { getMandatoryNamedGroup } from 'obsidian-dev-utils/reg-exp';
import { replaceAll } from 'obsidian-dev-utils/string';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type {
  EmailAddress,
  EmailMessageFull,
  EmailMessageSummary
} from './providers/email-provider-types.ts';
import type { EmailProvider } from './providers/email-provider.ts';

const FORWARD_PREFIX_PATTERN = /^(?:Fwd|FW|I|WG|TR|RV|ENC): ?/i;

const GMAIL_FORWARD_HEADER_PATTERN = /---------- Forwarded message ---------\s*\r?\n(?:.*\r?\n)*?\s*\r?\n/;

const OUTLOOK_HEADER_LINE_PATTERN = /^[ \t]*(?:\*\*)?(?<label>[^*:\r\n]+?)(?:\*\*)?:(?:\*\*)?[ \t]*(?<value>.*?)[ \t\r]*$/;

type OutlookHeaderField = 'cc' | 'from' | 'sent' | 'subject' | 'to';

// Outlook localizes the labels of the header block it writes above a forwarded message.
// cSpell:disable
const OUTLOOK_HEADER_LABELS: readonly (readonly [OutlookHeaderField, readonly string[]])[] = [
  ['cc', ['cc', 'copia', 'dw', 'kopie', 'копия']],
  ['from', ['da', 'de', 'from', 'od', 'van', 'von', 'от']],
  ['sent', ['data', 'date', 'enviado', 'enviado el', 'envoyé', 'gesendet', 'inviato', 'sent', 'verzonden', 'wysłane', 'отправлено']],
  ['subject', ['asunto', 'assunto', 'betreff', 'objet', 'oggetto', 'onderwerp', 'subject', 'temat', 'тема']],
  ['to', ['a', 'à', 'aan', 'an', 'do', 'para', 'to', 'кому']]
];
// cSpell:enable

const OUTLOOK_HEADER_FIELD_BY_LABEL = new Map<string, OutlookHeaderField>(
  OUTLOOK_HEADER_LABELS.flatMap(([field, labels]) => labels.map((label) => [label, field] as const))
);

const LEADING_BLANK_LINES_PATTERN = /^(?:[ \t]*\r?\n)+/;

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
  attachmentsString: string;
  body: string;
  cc: string;
  dateString: string;
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
    const basePath = fillTemplate({ emailData, isPathTemplate: true, template: this.pluginSettingsComponent.settings.emailNotePathTemplate });
    const filePath = this.app.vault.getAvailablePath(basePath, 'md');

    const { attachmentLinks, savedAttachments } = await this.downloadAttachments(fullMessage, filePath);
    emailData.body = replaceInlineAttachmentRefs(emailData.body, savedAttachments);
    emailData.attachmentsString = attachmentLinks;

    const content = fillTemplate({ emailData, template: this.pluginSettingsComponent.settings.emailNoteTemplate });

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
      const data = await this.emailProvider.downloadAttachment({ attachmentId: attachment.id, messageId: fullMessage.id });
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
      attachmentsString: '',
      body,
      cc: ccFormatted,
      dateString: momentFunction(fullMessage.createdAt).format(),
      from: fromFormatted,
      subject: fullMessage.subject,
      to: toFormatted
    };

    if (this.pluginSettingsComponent.settings.shouldExtractForwardedEmail) {
      const rfc822Attachment = fullMessage.attachments.find((a) => a.contentType === 'message/rfc822');
      if (rfc822Attachment) {
        const attachmentData = await this.emailProvider.downloadAttachment({ attachmentId: rfc822Attachment.id, messageId: fullMessage.id });
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
  data.from = extractHeaderValue({ fallback: data.from, pattern: HEADER_FROM_PATTERN, text: headerBlock });
  data.to = extractHeaderValue({ fallback: data.to, pattern: HEADER_TO_PATTERN, text: headerBlock });
  data.cc = extractHeaderValue({ fallback: '', pattern: HEADER_CC_PATTERN, text: headerBlock });
  data.subject = extractHeaderValue({ fallback: data.subject, pattern: HEADER_SUBJECT_PATTERN, text: headerBlock });
}

function applyOutlookHeaderOverrides(data: EmailData, fields: ReadonlyMap<OutlookHeaderField, string>): void {
  // `findOutlookHeaderBlock` only returns a block that has the From and Subject lines.
  data.from = cleanHeaderValue(ensureNonNullable(fields.get('from')));
  data.to = normalizeAddressList(cleanHeaderValue(fields.get('to') ?? data.to));
  data.cc = normalizeAddressList(cleanHeaderValue(fields.get('cc') ?? ''));
  data.subject = cleanHeaderValue(ensureNonNullable(fields.get('subject')));
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

interface ExtractHeaderValueParams {
  readonly fallback: string;
  readonly pattern: RegExp;
  readonly text: string;
}

interface OutlookHeaderBlock {
  readonly endIndex: number;
  readonly fields: ReadonlyMap<OutlookHeaderField, string>;
}

interface OutlookHeaderLine {
  readonly field: OutlookHeaderField;
  readonly value: string;
}

interface TextLine {
  readonly index: number;
  readonly text: string;
}

function checkIsDataTable(table: Element): boolean {
  return table.getAttribute('role') !== 'presentation' && Boolean(table.querySelector('th')) && !table.querySelector('table');
}

function cleanHeaderValue(value: string): string {
  return unescapeMarkdown(stripMarkdownFormatting(value.trim()));
}

function extractEmailFromRfc822(emlContent: string): EmailData {
  const headerBodySeparator = /\r?\n\r?\n/;
  const separatorMatch = headerBodySeparator.exec(emlContent);

  const headers = separatorMatch ? emlContent.slice(0, separatorMatch.index) : emlContent;
  const body = separatorMatch ? emlContent.slice(separatorMatch.index + separatorMatch[0].length) : '';

  return {
    attachmentsString: '',
    body,
    cc: HEADER_CC_PATTERN.exec(headers)?.groups?.['value'] ?? '',
    dateString: normalizeDate(HEADER_DATE_PATTERN.exec(headers)?.groups?.['value'] ?? ''),
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

  result.subject = replaceAll({ $string: result.subject, replacer: '', searchValue: FORWARD_PREFIX_PATTERN });

  const gmailMatch = GMAIL_FORWARD_HEADER_PATTERN.exec(result.body);
  if (gmailMatch) {
    const headerBlock = gmailMatch[0];
    applyHeaderOverrides(result, headerBlock);
    result.dateString = normalizeDate((HEADER_DATE_PATTERN.exec(headerBlock)?.groups?.['value'] ?? result.dateString).trim());

    result.body = result.body.slice(gmailMatch.index + headerBlock.length);
    return result;
  }

  const outlookHeaderBlock = findOutlookHeaderBlock(result.body);
  if (outlookHeaderBlock) {
    applyOutlookHeaderOverrides(result, outlookHeaderBlock.fields);

    result.body = replaceAll({ $string: result.body.slice(outlookHeaderBlock.endIndex), replacer: '', searchValue: LEADING_BLANK_LINES_PATTERN });
    return result;
  }

  return result;
}

function extractHeaderValue(params: ExtractHeaderValueParams): string {
  const { fallback, pattern, text } = params;
  const raw = pattern.exec(text)?.groups?.['value'];
  return raw === undefined ? fallback : cleanHeaderValue(raw);
}

function findOutlookHeaderBlock(body: string): null | OutlookHeaderBlock {
  const lines = splitLines(body);
  for (const [startLineIndex, startLine] of lines.entries()) {
    const startHeaderLine = parseOutlookHeaderLine(startLine.text);
    if (startHeaderLine?.field !== 'from') {
      continue;
    }

    const fields = new Map<OutlookHeaderField, string>([[startHeaderLine.field, startHeaderLine.value]]);
    let lastLine = startLine;
    for (const line of lines.slice(startLineIndex + 1)) {
      const headerLine = parseOutlookHeaderLine(line.text);
      if (!headerLine || fields.has(headerLine.field)) {
        break;
      }
      fields.set(headerLine.field, headerLine.value);
      lastLine = line;
    }

    if (fields.has('sent') && fields.has('subject')) {
      return { endIndex: lastLine.index + lastLine.text.length, fields };
    }
  }

  return null;
}

function formatAddress(address: EmailAddress): string {
  return address.name
    ? `${address.name} <${address.address}>`
    : address.address;
}

function formatAddresses(addresses: EmailAddress[]): string {
  return addresses.map((a) => formatAddress(a)).join(', ');
}

function normalizeAddressList(value: string): string {
  return value.split(/\s*;\s*/).filter(Boolean).join(', ');
}

function parseOutlookHeaderLine(line: string): null | OutlookHeaderLine {
  const match = OUTLOOK_HEADER_LINE_PATTERN.exec(line);
  if (!match) {
    return null;
  }
  const field = OUTLOOK_HEADER_FIELD_BY_LABEL.get(getMandatoryNamedGroup(match, 'label').trim().toLowerCase());
  return field ? { field, value: getMandatoryNamedGroup(match, 'value') } : null;
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
  return replaceAll({
    $string: body,
    replacer: ({ capturedGroupArguments: [alt = '', attachId = ''] }) => {
      const savedFilename = savedAttachments.get(attachId);
      return savedFilename ? `![[${savedFilename}]]` : `![[${alt || 'attachment'}]]`;
    },
    searchValue: INLINE_ATTACHMENT_PATTERN
  });
}

function sanitizeEmailHtml(html: string, options: SanitizeOptions): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  if (options.shouldStripHiddenElements) {
    removeHiddenElements(doc);
  }

  unwrapLayoutTables(doc);

  return doc.body.innerHTML;
}

// Splits on `\n` alone, keeping any `\r` on its line: a multiline `^`/`$` treats a lone `\r` as a line end too.
function splitLines(text: string): TextLine[] {
  let index = 0;
  return text.split('\n').map((lineText) => {
    const line = { index, text: lineText };
    index += lineText.length + 1;
    return line;
  });
}

function unescapeMarkdown(text: string): string {
  return replaceAll({
    $string: text,
    replacer: ({ capturedGroupArguments: [character] }) => ensureNonNullable(character),
    searchValue: /\\(?<character>[\\`*_[\]#+\-.!>~|])/g
  });
}

function unwrapLayoutTable(table: Element): void {
  for (const element of table.querySelectorAll('tbody, thead, tfoot, tr, td, th')) {
    if (element.closest('table') === table) {
      unwrapElement(element);
    }
  }
  unwrapElement(table);
}

function unwrapLayoutTables(doc: Document): void {
  for (const table of doc.querySelectorAll('table')) {
    if (!table.querySelector('tr')) {
      table.remove();
      continue;
    }
    if (checkIsDataTable(table)) {
      continue;
    }
    unwrapLayoutTable(table);
  }
}

const HIDDEN_STYLE_PATTERN = /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0/i;

function checkHiddenByStyle(style: string): boolean {
  return HIDDEN_STYLE_PATTERN.test(style);
}

function stripMarkdownFormatting(text: string): string {
  const withoutBold = replaceAll({
    $string: text,
    replacer: ({ capturedGroupArguments: [content] }) => ensureNonNullable(content),
    searchValue: /\*\*(?<content>[^*]+)\*\*/g
  });
  return replaceAll({
    $string: withoutBold,
    replacer: ({ capturedGroupArguments: [label] }) => ensureNonNullable(label),
    searchValue: /\[(?<label>[^\]]+)\]\([^)]+\)/g
  });
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

const momentFunction = extractDefaultExportInterop(momentLib);

const KNOWN_DATE_FORMATS = [
  'ddd, MMM D, YYYY [at] h:mm A',
  'ddd, D MMM YYYY'
];

interface ExtractTokenValueParams {
  readonly emailData: EmailData;
  readonly format: string;
  readonly isPathTemplate: boolean;
  readonly token: string;
}

interface FillTemplateParams {
  readonly emailData: EmailData;
  readonly isPathTemplate?: boolean;
  readonly template: string;
}

function extractTokenValue(params: ExtractTokenValueParams): string {
  const { emailData, format, isPathTemplate, token } = params;
  let value: string;
  switch (token) {
    case 'attachments': {
      if (format) {
        throw new Error(`Attachments token does not support format: ${format}`);
      }
      if (isPathTemplate) {
        throw new Error('Attachments token is not supported in path template');
      }
      value = emailData.attachmentsString;
      break;
    }
    case 'body': {
      if (format) {
        throw new Error(`Body token does not support format: ${format}`);
      }
      if (isPathTemplate) {
        throw new Error('Body token is not supported in path template');
      }
      value = emailData.body;
      break;
    }
    case 'cc': {
      if (format) {
        throw new Error(`CC token does not support format: ${format}`);
      }
      value = emailData.cc;
      break;
    }
    case 'date': {
      value = momentFunction(emailData.dateString).format(format);
      break;
    }
    case 'from': {
      if (format) {
        throw new Error(`From token does not support format: ${format}`);
      }
      value = emailData.from;
      break;
    }
    case 'subject': {
      if (format) {
        throw new Error(`Subject token does not support format: ${format}`);
      }
      value = emailData.subject || (isPathTemplate ? 'Untitled' : '');
      break;
    }
    case 'to': {
      if (format) {
        throw new Error(`To token does not support format: ${format}`);
      }
      value = emailData.to;
      break;
    }
    default: {
      throw new Error(`Unknown token: ${token}`);
    }
  }
  return isPathTemplate ? sanitizeFileName(value) : value;
}

function fillTemplate(params: FillTemplateParams): string {
  const { emailData, isPathTemplate = false, template } = params;
  const TOKEN_PATTERN = /\{\{(?<Token>\w+)(?::(?<Format>[^}]+))?\}\}/g;

  return replaceAll({
    $string: template,
    replacer: ({ capturedGroupArguments: [token = '', format = ''] }) => {
      return extractTokenValue({ emailData, format, isPathTemplate, token });
    },
    searchValue: TOKEN_PATTERN
  });
}

function normalizeDate(dateString: string): string {
  const normalized = normalizeWhitespace(dateString);
  const parsed = momentFunction(normalized, KNOWN_DATE_FORMATS, true);
  return parsed.isValid() ? parsed.format() : dateString;
}

function normalizeWhitespace($string: string): string {
  return replaceAll({ $string, replacer: ' ', searchValue: /\s/g });
}

function sanitizeFileName(name: string): string {
  return replaceAll({ $string: name, replacer: '_', searchValue: getOsAndObsidianUnsafePathCharsRegExp(true) }).trim();
}
