import dedent from 'dedent';
import { createTransport } from 'nodemailer';
import { sleep } from 'obsidian-dev-utils/async';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';
import { z } from 'zod';

import {
  generatePassword,
  generateUsername
} from '../../string-generators.ts';
import { MAIL_TM_API_BASE_URL } from './mail-tm-constants.ts';

const mailTmAddressSchema = z.object({
  address: z.string(),
  name: z.string()
});

const mailTmDomainSchema = z.object({
  domain: z.string(),
  isActive: z.boolean()
});

const mailTmDomainsResponseSchema = z.object({
  'hydra:member': z.array(mailTmDomainSchema)
});

const mailTmMessageSchema = z.object({
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

const mailTmAttachmentSchema = z.object({
  contentType: z.string(),
  filename: z.string(),
  id: z.string()
});

const mailTmMessageFullSchema = mailTmMessageSchema.extend({
  attachments: z.array(mailTmAttachmentSchema).optional().default([]),
  cc: z.array(mailTmAddressSchema),
  html: z.array(z.string()),
  text: z.string()
});

const mailTmMessagesResponseSchema = z.object({
  'hydra:member': z.array(mailTmMessageSchema)
});

const mailTmTokenResponseSchema = z.object({
  token: z.string()
});

const mailTmAccountResponseSchema = z.object({
  '@context': z.string(),
  '@id': z.string(),
  '@type': z.string(),
  'address': z.string(),
  'id': z.string()
});

const POLL_INTERVAL_IN_MILLISECONDS = 3000;
const MAX_WAIT_IN_MILLISECONDS = 60_000;
const FORWARDED_EMAIL_RFC822 = dedent`
  From: original-sender@example.com
  To: original-recipient@example.com
  Subject: Original subject
  Date: Mon, 14 Apr 2026 10:00:00 +0000
  Content-Type: text/plain; charset=utf-8

  This is the original forwarded email body.
`.replaceAll('\n', '\r\n');

interface TestAccount {
  address: string;
  password: string;
  token: string;
}

// Integration tests run in Node.js (no window), so native fetch is reached through globalThis.
// See scripts/eslint-config.ts, which turns off obsidianmd/no-global-this for no-app integration tests.
const nativeFetch = globalThis.fetch;

function addSuffix(address: string, suffix: string): string {
  return address.replace('@', `+${suffix}@`);
}

function createSmtpTransport(): ReturnType<typeof createTransport> {
  return createTransport({
    auth: {
      pass: getRequiredEnv('SMTP_PASS'),
      user: getRequiredEnv('SMTP_USER')
    },
    host: getRequiredEnv('SMTP_HOST'),
    port: Number(getRequiredEnv('SMTP_PORT')),
    secure: getRequiredEnv('SMTP_SECURE') === 'true'
  });
}

async function fetchJson(url: string, options?: RequestInit): Promise<unknown> {
  const response = await nativeFetch(url, options);
  return response.json();
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required. Add it to your .env file.`);
  }
  return value;
}

async function pollForMessages(token: string, expectedCount: number): Promise<z.infer<typeof mailTmMessagesResponseSchema>['hydra:member']> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_IN_MILLISECONDS) {
    const json = await fetchJson(`${MAIL_TM_API_BASE_URL}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = mailTmMessagesResponseSchema.parse(json);
    const messages = data['hydra:member'];

    if (messages.length >= expectedCount) {
      return messages;
    }

    await sleep({ milliseconds: POLL_INTERVAL_IN_MILLISECONDS });
  }

  throw new Error(`Expected ${String(expectedCount)} messages but did not receive them within ${String(MAX_WAIT_IN_MILLISECONDS / 1000)} seconds`);
}

async function sendForwardedEmail(baseAddress: string): Promise<void> {
  const smtpUser = getRequiredEnv('SMTP_USER');
  const transport = createSmtpTransport();

  await transport.sendMail({
    attachments: [
      {
        content: FORWARDED_EMAIL_RFC822,
        contentType: 'message/rfc822',
        filename: 'forwarded.eml'
      }
    ],
    from: smtpUser,
    subject: 'Fwd: Original subject',
    text: 'See the forwarded message attached.',
    to: baseAddress
  });
}

async function sendGmailForwardedEmail(baseAddress: string): Promise<void> {
  const smtpUser = getRequiredEnv('SMTP_USER');
  const transport = createSmtpTransport();

  await transport.sendMail({
    from: smtpUser,
    html: dedent`
      <div><br clear="all"></div>
      <div><div dir="ltr" class="gmail_signature"><div dir="ltr"><div><br></div><div>Regards,</div><div>Test User</div></div></div></div>
      <br><br>
      <div class="gmail_quote gmail_quote_container">
        <div dir="ltr" class="gmail_attr">---------- Forwarded message ---------<br>
          From: <strong class="gmail_sendername" dir="auto">Original Sender</strong> <span dir="auto">&lt;orig@test.com&gt;</span><br>
          Date: Tue, Apr 14, 2026 at 5:16\u202FAM<br>
          Subject: Test Forward Subject<br>
          To: dest@test.com<br>
        </div>
        <br><br>
        <div dir="ltr">Forwarded body content</div>
      </div>
    `,
    subject: 'Fwd: Test Forward Subject',
    text: 'Regards,\nTest User\n\n\n---------- Forwarded message ---------\nFrom: Original Sender <orig@test.com>\nDate: Tue, Apr 14, 2026 at 5:16\u202FAM\nSubject: Test Forward Subject\nTo: dest@test.com\n\nForwarded body content',
    to: baseAddress
  });
}

async function sendInlineImageEmail(baseAddress: string): Promise<void> {
  const smtpUser = getRequiredEnv('SMTP_USER');
  const transport = createSmtpTransport();

  await transport.sendMail({
    attachments: [
      {
        cid: 'test-image-cid',
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        contentType: 'image/png',
        filename: 'inline-test.png'
      }
    ],
    from: smtpUser,
    html: '<div><img src="cid:test-image-cid" alt="inline-test.png"><p>Email with inline image</p></div>',
    subject: 'Inline image test',
    text: '[image: inline-test.png]\nEmail with inline image',
    to: baseAddress
  });
}

async function sendNormalEmail(baseAddress: string): Promise<void> {
  const smtpUser = getRequiredEnv('SMTP_USER');
  const transport = createSmtpTransport();

  await transport.sendMail({
    attachments: [
      {
        content: 'Hello from attachment 1',
        contentType: 'text/plain',
        filename: 'test-file-1.txt'
      },
      {
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        contentType: 'image/png',
        filename: 'test-image.png'
      },
      {
        content: '<h1>Hello</h1>',
        contentType: 'text/html',
        filename: 'test-page.html'
      }
    ],
    bcc: addSuffix(baseAddress, 'bcc'),
    cc: addSuffix(baseAddress, 'cc'),
    from: smtpUser,
    subject: 'Integration test email',
    text: 'This is a test email body.',
    to: addSuffix(baseAddress, 'to')
  });
}

let testAccount: TestAccount;

async function fetchAttachmentContent(messageId: string, attachmentId: string): Promise<Response> {
  return nativeFetch(
    `${MAIL_TM_API_BASE_URL}/messages/${messageId}/attachment/${attachmentId}`,
    { headers: { Authorization: `Bearer ${testAccount.token}` } }
  );
}

async function getFullMessage(messageId: string): Promise<z.infer<typeof mailTmMessageFullSchema>> {
  const fullJson = await fetchJson(`${MAIL_TM_API_BASE_URL}/messages/${messageId}`, {
    headers: { Authorization: `Bearer ${testAccount.token}` }
  });
  return mailTmMessageFullSchema.parse(fullJson);
}

async function pollForSubject(token: string, subject: string): Promise<z.infer<typeof mailTmMessageSchema>> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_IN_MILLISECONDS) {
    const json = await fetchJson(`${MAIL_TM_API_BASE_URL}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = mailTmMessagesResponseSchema.parse(json);
    const found = data['hydra:member'].find((m) => m.subject === subject);
    if (found) {
      return found;
    }

    await sleep({ milliseconds: POLL_INTERVAL_IN_MILLISECONDS });
  }

  throw new Error(`Message with subject "${subject}" not received within ${String(MAX_WAIT_IN_MILLISECONDS / 1000)} seconds`);
}

async function sendSimpleEmail(baseAddress: string, subject: string): Promise<void> {
  const transport = createSmtpTransport();

  await transport.sendMail({
    from: getRequiredEnv('SMTP_USER'),
    subject,
    text: 'Seen flag test body.',
    to: baseAddress
  });
}

describe('Mail.tm API', () => {
  beforeAll(async () => {
    const domainsJson = await fetchJson(`${MAIL_TM_API_BASE_URL}/domains`);
    const domainsData = mailTmDomainsResponseSchema.parse(domainsJson);
    const activeDomain = domainsData['hydra:member'].find((d) => d.isActive);

    if (!activeDomain) {
      throw new Error('No active Mail.tm domains available for integration test');
    }

    const username = generateUsername();
    const address = `test-${username}@${activeDomain.domain}`;
    const password = generatePassword();

    const accountJson = await fetchJson(`${MAIL_TM_API_BASE_URL}/accounts`, {
      body: JSON.stringify({ address, password }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    });
    mailTmAccountResponseSchema.parse(accountJson);

    const tokenJson = await fetchJson(`${MAIL_TM_API_BASE_URL}/token`, {
      body: JSON.stringify({ address, password }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    });
    const tokenData = mailTmTokenResponseSchema.parse(tokenJson);

    testAccount = { address, password, token: tokenData.token };
  });

  afterAll(async () => {
    if (testAccount.token) {
      await nativeFetch(`${MAIL_TM_API_BASE_URL}/me`, {
        headers: { Authorization: `Bearer ${testAccount.token}` },
        method: 'DELETE'
      });
    }
  });

  describe('GET /domains', () => {
    it('should return domains matching schema', async () => {
      const json = await fetchJson(`${MAIL_TM_API_BASE_URL}/domains`);

      const result = mailTmDomainsResponseSchema.safeParse(json);

      expect(result.success).toBe(true);
    });

    it('should have at least one active domain', async () => {
      const json = await fetchJson(`${MAIL_TM_API_BASE_URL}/domains`);
      const data = mailTmDomainsResponseSchema.parse(json);

      const hasActive = data['hydra:member'].some((d) => d.isActive);

      expect(hasActive).toBe(true);
    });
  });

  describe('POST /token', () => {
    it('should return token matching schema', async () => {
      const json = await fetchJson(`${MAIL_TM_API_BASE_URL}/token`, {
        body: JSON.stringify({
          address: testAccount.address,
          password: testAccount.password
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });

      const result = mailTmTokenResponseSchema.safeParse(json);

      expect(result.success).toBe(true);
    });
  });

  describe('GET /messages', () => {
    it('should return messages matching schema', async () => {
      const json = await fetchJson(`${MAIL_TM_API_BASE_URL}/messages`, {
        headers: { Authorization: `Bearer ${testAccount.token}` }
      });

      const result = mailTmMessagesResponseSchema.safeParse(json);

      expect(result.success).toBe(true);
    });
  });

  describe('normal email', () => {
    it('should receive and validate full message schema', async () => {
      await sendNormalEmail(testAccount.address);

      const EXPECTED_NORMAL_MESSAGE_COUNT = 3;
      const messages = await pollForMessages(testAccount.token, EXPECTED_NORMAL_MESSAGE_COUNT);
      const messageId = messages[0]?.id ?? '';
      const messageJson = await fetchJson(`${MAIL_TM_API_BASE_URL}/messages/${messageId}`, {
        headers: { Authorization: `Bearer ${testAccount.token}` }
      });

      const result = mailTmMessageFullSchema.safeParse(messageJson);

      if (!result.success) {
        const JSON_INDENT = 2;
        console.error('Schema validation errors:', JSON.stringify(result.error.issues, null, JSON_INDENT));
        console.error('API response:', JSON.stringify(messageJson, null, JSON_INDENT));
      }

      expect(result.success).toBe(true);
    });

    it('should have correct sender, recipients, and subject', async () => {
      const EXPECTED_NORMAL_MESSAGE_COUNT = 3;
      const messages = await pollForMessages(testAccount.token, EXPECTED_NORMAL_MESSAGE_COUNT);
      const toMessage = messages.find((m) => m.to[0]?.address === addSuffix(testAccount.address, 'to'));

      expect(toMessage).toBeDefined();
      expect(toMessage?.subject).toBe('Integration test email');
      expect(toMessage?.from.address).toBe(process.env['SMTP_USER']);
      expect(toMessage?.hasAttachments).toBe(true);
    });

    it('should have correct cc', async () => {
      const EXPECTED_NORMAL_MESSAGE_COUNT = 3;
      const messages = await pollForMessages(testAccount.token, EXPECTED_NORMAL_MESSAGE_COUNT);
      const toMessage = messages.find((m) => m.to[0]?.address === addSuffix(testAccount.address, 'to'));
      const fullMessage = await getFullMessage(toMessage?.id ?? '');

      expect(fullMessage.cc[0]?.address).toBe(addSuffix(testAccount.address, 'cc'));
    });

    it('should have attachments with correct content', async () => {
      const EXPECTED_NORMAL_MESSAGE_COUNT = 3;
      const messages = await pollForMessages(testAccount.token, EXPECTED_NORMAL_MESSAGE_COUNT);
      const toMessage = messages.find((m) => m.to[0]?.address === addSuffix(testAccount.address, 'to'));
      const fullMessage = await getFullMessage(toMessage?.id ?? '');

      const EXPECTED_ATTACHMENT_COUNT = 3;
      expect(fullMessage.attachments).toHaveLength(EXPECTED_ATTACHMENT_COUNT);
      expect(fullMessage.attachments[0]?.filename).toBe('test-file-1.txt');
      expect(fullMessage.attachments[1]?.filename).toBe('test-image.png');
      expect(fullMessage.attachments[2]?.filename).toBe('test-page.html');

      const textResponse = await fetchAttachmentContent(fullMessage.id, fullMessage.attachments[0]?.id ?? '');
      expect(await textResponse.text()).toBe('Hello from attachment 1');

      const imageResponse = await fetchAttachmentContent(fullMessage.id, fullMessage.attachments[1]?.id ?? '');
      expect(Buffer.from(await imageResponse.arrayBuffer())).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      const htmlResponse = await fetchAttachmentContent(fullMessage.id, fullMessage.attachments[2]?.id ?? '');
      expect(await htmlResponse.text()).toBe('<h1>Hello</h1>');
    });
  });

  describe('inline image email', () => {
    it('should receive email with inline image attachment', async () => {
      await sendInlineImageEmail(testAccount.address);

      const EXPECTED_MESSAGE_COUNT = 4;
      const messages = await pollForMessages(testAccount.token, EXPECTED_MESSAGE_COUNT);
      const inlineMessage = messages.find((m) => m.subject === 'Inline image test');

      expect(inlineMessage).toBeDefined();
      expect(inlineMessage?.hasAttachments).toBe(true);
    });

    it('should have inline image as attachment and HTML with cid reference', async () => {
      const EXPECTED_MESSAGE_COUNT = 4;
      const messages = await pollForMessages(testAccount.token, EXPECTED_MESSAGE_COUNT);
      const inlineMessage = messages.find((m) => m.subject === 'Inline image test');
      const fullMessage = await getFullMessage(inlineMessage?.id ?? '');

      expect(fullMessage.attachments.length).toBeGreaterThanOrEqual(1);
      const inlineAttachment = fullMessage.attachments.find((a) => a.filename === 'inline-test.png');
      expect(inlineAttachment).toBeDefined();

      const html = fullMessage.html.join('');
      expect(html).toContain('attachment:');
      expect(html).toContain('inline-test.png');
    });
  });

  describe('gmail-style forwarded email', () => {
    it('should receive Gmail forwarded email with forward headers in body', async () => {
      await sendGmailForwardedEmail(testAccount.address);

      const EXPECTED_MESSAGE_COUNT = 5;
      const messages = await pollForMessages(testAccount.token, EXPECTED_MESSAGE_COUNT);
      const gmailForward = messages.find((m) => m.subject === 'Fwd: Test Forward Subject');

      expect(gmailForward).toBeDefined();
    });

    it('should have Gmail forward header pattern in text body', async () => {
      const EXPECTED_MESSAGE_COUNT = 5;
      const messages = await pollForMessages(testAccount.token, EXPECTED_MESSAGE_COUNT);
      const gmailForward = messages.find((m) => m.subject === 'Fwd: Test Forward Subject');
      const fullMessage = await getFullMessage(gmailForward?.id ?? '');

      expect(fullMessage.text).toContain('---------- Forwarded message ---------');
      expect(fullMessage.text).toContain('From: Original Sender <orig@test.com>');
      expect(fullMessage.text).toContain('Forwarded body content');

      const html = fullMessage.html.join('');
      expect(html).toContain('gmail_quote');
      expect(html).toContain('gmail_attr');
    });
  });

  describe('forwarded email', () => {
    it('should receive forwarded email with message/rfc822 attachment', async () => {
      await sendForwardedEmail(testAccount.address);

      const EXPECTED_MESSAGE_COUNT = 6;
      const messages = await pollForMessages(testAccount.token, EXPECTED_MESSAGE_COUNT);
      const forwardedMessage = messages.find((m) => m.subject === 'Fwd: Original subject');

      expect(forwardedMessage).toBeDefined();
      expect(forwardedMessage?.hasAttachments).toBe(true);
    });

    it('should have message/rfc822 attachment with original email content', async () => {
      const EXPECTED_MESSAGE_COUNT = 6;
      const messages = await pollForMessages(testAccount.token, EXPECTED_MESSAGE_COUNT);
      const forwardedMessage = messages.find((m) => m.subject === 'Fwd: Original subject');
      const fullMessage = await getFullMessage(forwardedMessage?.id ?? '');

      expect(fullMessage.attachments).toHaveLength(1);
      expect(fullMessage.attachments[0]?.filename).toBe('forwarded.eml');

      const emlResponse = await fetchAttachmentContent(fullMessage.id, fullMessage.attachments[0]?.id ?? '');
      const emlContent = await emlResponse.text();
      expect(emlContent).toContain('Subject: Original subject');
      expect(emlContent).toContain('This is the original forwarded email body.');
    });
  });

  describe('seen flag', () => {
    it('should keep a message unseen when only read, and mark it seen only on explicit PATCH', async () => {
      const subject = 'Seen flag integration test';
      await sendSimpleEmail(testAccount.address, subject);
      const message = await pollForSubject(testAccount.token, subject);

      // A newly received message starts unseen.
      expect(message.seen).toBe(false);

      // Reading the full message the way ImapProviderDesktopComponent's Mail.tm counterpart
      // (MailTmProviderComponent.getMessage) does — a GET on /messages/{id} — must NOT flip `seen`,
      // Otherwise the "Mark emails as seen" opt-out would be defeated just by building the note.
      await getFullMessage(message.id);
      const afterRead = await pollForSubject(testAccount.token, subject);
      expect(afterRead.seen).toBe(false);

      // MailTmProviderComponent.markMessageAsSeen issues a merge-patch with `{ seen: true }`.
      await nativeFetch(`${MAIL_TM_API_BASE_URL}/messages/${message.id}`, {
        body: JSON.stringify({ seen: true }),
        headers: {
          'Authorization': `Bearer ${testAccount.token}`,
          'Content-Type': 'application/merge-patch+json'
        },
        method: 'PATCH'
      });
      const afterPatch = await pollForSubject(testAccount.token, subject);
      expect(afterPatch.seen).toBe(true);
    });
  });
});
