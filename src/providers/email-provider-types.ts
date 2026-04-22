export interface EmailAddress {
  address: string;
  name: string;
}

export interface EmailAttachment {
  contentType: string;
  filename: string;
  id: string;
}

export interface EmailMessageFull extends EmailMessageSummary {
  attachments: EmailAttachment[];
  cc: EmailAddress[];
  html: string[];
  text: string;
}

export interface EmailMessageSummary {
  createdAt: string;
  from: EmailAddress;
  hasAttachments: boolean;
  id: string;
  seen: boolean;
  subject: string;
  to: EmailAddress[];
}
