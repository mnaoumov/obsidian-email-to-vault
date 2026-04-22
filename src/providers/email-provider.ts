import type {
  EmailMessageFull,
  EmailMessageSummary
} from './email-provider-types.ts';

export interface EmailProvider {
  deleteMessage(messageId: string): Promise<void>;
  downloadAttachment(messageId: string, attachmentId: string): Promise<ArrayBuffer>;
  getMessage(messageId: string): Promise<EmailMessageFull>;
  getMessages(): Promise<EmailMessageSummary[]>;
  markMessageAsSeen(messageId: string): Promise<void>;
}
