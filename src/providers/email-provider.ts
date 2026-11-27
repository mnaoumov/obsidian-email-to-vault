import type {
  EmailMessageFull,
  EmailMessageSummary
} from './email-provider-types.ts';

export interface EmailProvider {
  readonly deleteMessage: (messageId: string) => Promise<void>;
  readonly downloadAttachment: (params: EmailProviderDownloadAttachmentParams) => Promise<ArrayBuffer>;
  /**
   * Downloads the message exactly as the server holds it: the raw RFC 822 source, headers and every MIME part.
   */
  readonly downloadMessageSource: (messageId: string) => Promise<ArrayBuffer>;
  readonly getMessage: (messageId: string) => Promise<EmailMessageFull>;
  readonly getMessages: () => Promise<EmailMessageSummary[]>;
  readonly markMessageAsSeen: (messageId: string) => Promise<void>;
  /**
   * Logs in to the mail service with the saved settings and touches no message.
   *
   * Resolves when the service accepted the login, and rejects with the reason otherwise.
   */
  readonly testConnection: () => Promise<void>;
}

export interface EmailProviderDownloadAttachmentParams {
  readonly attachmentId: string;
  readonly messageId: string;
}
