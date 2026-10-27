import type {
  EmailMessageFull,
  EmailMessageSummary
} from './email-provider-types.ts';

export interface EmailProvider {
  readonly deleteMessage: (messageId: string) => Promise<void>;
  readonly downloadAttachment: (params: EmailProviderDownloadAttachmentParams) => Promise<ArrayBuffer>;
  readonly getMessage: (messageId: string) => Promise<EmailMessageFull>;
  readonly getMessages: () => Promise<EmailMessageSummary[]>;
  readonly markMessageAsSeen: (messageId: string) => Promise<void>;
}

export interface EmailProviderDownloadAttachmentParams {
  readonly attachmentId: string;
  readonly messageId: string;
}
