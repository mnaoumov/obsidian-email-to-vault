export interface EmailAddress {
  readonly address: string;
  readonly name: string;
}

export interface EmailAttachment {
  readonly contentType: string;
  readonly filename: string;
  readonly id: string;
}

export interface EmailMessageFull extends EmailMessageSummary {
  readonly attachments: EmailAttachment[];
  readonly cc: EmailAddress[];
  readonly html: string[];
  readonly text: string;
}

export interface EmailMessageSummary {
  readonly createdAt: string;
  readonly from: EmailAddress;
  readonly hasAttachments: boolean;
  readonly id: string;
  readonly seen: boolean;
  readonly subject: string;
  readonly to: EmailAddress[];
}
