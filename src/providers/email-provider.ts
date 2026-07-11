import type {
  EmailMessageFull,
  EmailMessageSummary
} from './email-provider-types.ts';

export interface EmailProvider {
  deleteMessage(messageId: string): Promise<void>;
  downloadAttachment(params: EmailProviderDownloadAttachmentParams): Promise<ArrayBuffer>;
  getMessage(messageId: string): Promise<EmailMessageFull>;
  getMessages(): Promise<EmailMessageSummary[]>;
  markMessageAsSeen(messageId: string): Promise<void>;
}

export interface EmailProviderDownloadAttachmentParams {
  readonly attachmentId: string;
  readonly messageId: string;
}
