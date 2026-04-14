import {
  moment as momentLib,
  Notice
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

const FORWARD_PREFIX_PATTERN = /^(?:Fwd|FW): /;

const GMAIL_FORWARD_HEADER_PATTERN = /---------- Forwarded message ---------\r?\n(?:.*\r?\n)*?\r?\n/;

const OUTLOOK_FORWARD_HEADER_PATTERN = /(?:^|\r?\n)From: .*\r?\nSent: .*\r?\nTo: .*\r?\nSubject: .*\r?\n\r?\n/;

const HEADER_FROM_PATTERN = /From: (?<value>.+)/;
const HEADER_SUBJECT_PATTERN = /Subject: (?<value>.+)/;
const HEADER_TO_PATTERN = /To: (?<value>.+)/;
const HEADER_DATE_PATTERN = /Date: (?<value>.+)/;

interface EmailData {
  body: string;
  cc: string;
  date: string;
  from: string;
  subject: string;
  to: string;
}

export class EmailChecker {
  private intervalId: null | number = null;

  public constructor(
    private readonly plugin: Plugin,
    private readonly mailTmManager: MailTmManager
  ) {
  }

  public async checkEmails(): Promise<void> {
    const { emailAddress } = this.plugin.settings;
    if (!emailAddress) {
      return;
    }

    new Notice('Checking emails...');

    const messages = await this.mailTmManager.getMessages();
    const unseenMessages = messages.filter((m) => !m.seen);

    if (unseenMessages.length === 0) {
      new Notice('No new emails');
      return;
    }

    for (const message of unseenMessages) {
      await this.saveEmailAsNote(message);
      if (this.plugin.settings.shouldDeleteSeenEmails) {
        await this.mailTmManager.deleteMessage(message.id);
      }
    }

    new Notice(`Saved ${String(unseenMessages.length)} new email(s)`);
  }

  public async redownloadEmails(count?: number): Promise<void> {
    const messages = await this.mailTmManager.getMessages();
    const toProcess = count ? messages.slice(0, count) : messages;
    for (const message of toProcess) {
      await this.saveEmailAsNote(message);
    }
    new Notice(`Redownloaded ${String(toProcess.length)} email(s)`);
  }

  public scheduleCheckEmails(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const checkIntervalInMilliseconds = this.getCheckIntervalInMilliseconds();
    if (checkIntervalInMilliseconds === 0) {
      return;
    }
    this.intervalId = this.plugin.registerInterval(activeWindow.setInterval(this.checkEmails.bind(this), checkIntervalInMilliseconds));
  }

  private buildNotePath(emailData: EmailData): string {
    const pathTemplate = this.plugin.settings.emailNotePathTemplate;
    const path = replacePathTemplate(pathTemplate, emailData);
    return `${path}.md`;
  }

  private async downloadAttachments(fullMessage: MailTmMessageFull, notePath: string): Promise<string> {
    if (fullMessage.attachments.length === 0) {
      return '';
    }

    const links: string[] = [];
    for (const attachment of fullMessage.attachments) {
      const data = await this.mailTmManager.downloadAttachment(fullMessage.id, attachment.id);
      const attachmentPath = await this.plugin.app.fileManager.getAvailablePathForAttachment(attachment.filename, notePath);
      await this.plugin.app.vault.createBinary(attachmentPath, data);
      const filename = extractFilename(attachmentPath);
      links.push(`![[${filename}]]`);
    }

    return links.join('\n');
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

  private extractEmailData(fullMessage: MailTmMessageFull): EmailData {
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

    if (this.plugin.settings.shouldStripForwardMarkers) {
      return extractForwardedEmail(data);
    }

    return data;
  }

  private getCheckIntervalInMilliseconds(): number {
    const SECONDS_PER_MINUTE = 60;
    const MILLISECONDS_PER_SECOND = 1000;
    const intervalInMinutes = this.plugin.settings.emailCheckIntervalInMinutes;
    return intervalInMinutes * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND;
  }

  private async saveEmailAsNote(message: MailTmMessage): Promise<void> {
    const fullMessage = await this.mailTmManager.getMessage(message.id);
    const emailData = this.extractEmailData(fullMessage);
    const filePath = this.buildNotePath(emailData);

    const attachmentLinks = await this.downloadAttachments(fullMessage, filePath);

    const template = this.plugin.settings.emailNoteTemplate;
    const content = replace(template, {
      '{{attachments}}': attachmentLinks,
      '{{body}}': emailData.body,
      '{{cc}}': emailData.cc,
      '{{date}}': emailData.date,
      '{{from}}': emailData.from,
      '{{subject}}': emailData.subject,
      '{{to}}': emailData.to
    });

    await this.ensureFolderExists(filePath);
    await this.plugin.app.vault.create(filePath, content);
  }
}

function applyHeaderOverrides(data: EmailData, headerBlock: string): void {
  data.from = HEADER_FROM_PATTERN.exec(headerBlock)?.groups?.['value'] ?? data.from;
  data.to = HEADER_TO_PATTERN.exec(headerBlock)?.groups?.['value'] ?? data.to;
  data.subject = HEADER_SUBJECT_PATTERN.exec(headerBlock)?.groups?.['value'] ?? data.subject;
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
    result.date = HEADER_DATE_PATTERN.exec(headerBlock)?.groups?.['value'] ?? result.date;

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

function formatAddress(address: MailTmAddress): string {
  return address.name
    ? `${address.name} <${address.address}>`
    : address.address;
}

function formatAddresses(addresses: MailTmAddress[]): string {
  return addresses.map((a) => formatAddress(a)).join(', ');
}

const momentFn = extractDefaultExportInterop(momentLib);

function formatDate(isoDate: string, format: string): string {
  return momentFn(isoDate).format(format);
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
