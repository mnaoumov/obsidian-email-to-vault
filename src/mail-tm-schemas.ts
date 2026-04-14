/* v8 ignore start -- Schema definitions are validated by integration tests, not unit tests. */

import { z } from 'zod';

export const mailTmAddressSchema = z.object({
  address: z.string(),
  name: z.string()
});

export const mailTmDomainSchema = z.object({
  domain: z.string(),
  isActive: z.boolean()
});

export const mailTmDomainsResponseSchema = z.object({
  'hydra:member': z.array(mailTmDomainSchema)
});

export const mailTmMessageSchema = z.object({
  createdAt: z.string(),
  downloadUrl: z.string(),
  from: mailTmAddressSchema,
  hasAttachments: z.boolean(),
  id: z.string(),
  seen: z.boolean(),
  size: z.number(),
  subject: z.string(),
  to: z.array(mailTmAddressSchema),
  updatedAt: z.string()
});

export const mailTmAttachmentSchema = z.object({
  filename: z.string(),
  id: z.string()
});

export const mailTmMessageFullSchema = mailTmMessageSchema.extend({
  attachments: z.array(mailTmAttachmentSchema),
  cc: z.array(mailTmAddressSchema),
  html: z.array(z.string()),
  text: z.string()
});

export const mailTmMessagesResponseSchema = z.object({
  'hydra:member': z.array(mailTmMessageSchema)
});

export const mailTmTokenResponseSchema = z.object({
  token: z.string()
});

export const mailTmAccountResponseSchema = z.object({
  '@context': z.string(),
  '@id': z.string(),
  '@type': z.string(),
  'address': z.string(),
  'id': z.string()
});

/* v8 ignore stop */
