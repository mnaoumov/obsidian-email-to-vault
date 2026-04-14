import type { z } from 'zod';

import dedent from 'dedent';
import { createTransport } from 'nodemailer';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import { generateRandomString } from './generate-random-string.ts';
import {
  mailTmAccountResponseSchema,
  mailTmDomainsResponseSchema,
  mailTmMessageFullSchema,
  mailTmMessagesResponseSchema,
  mailTmTokenResponseSchema
} from './mail-tm-schemas.ts';

const MAIL_TM_API_BASE_URL = 'https://api.mail.tm';
const RANDOM_ADDRESS_LENGTH = 10;
const RANDOM_PASSWORD_LENGTH = 20;
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

// eslint-disable-next-line no-restricted-globals -- Integration tests run in Node.js, not Obsidian. Using native fetch.
const nativeFetch = fetch;

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

    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_IN_MILLISECONDS);
    });
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

describe('Mail.tm API', () => {
  beforeAll(async () => {
    const domainsJson = await fetchJson(`${MAIL_TM_API_BASE_URL}/domains`);
    const domainsData = mailTmDomainsResponseSchema.parse(domainsJson);
    const activeDomain = domainsData['hydra:member'].find((d) => d.isActive);

    if (!activeDomain) {
      throw new Error('No active Mail.tm domains available for integration test');
    }

    const address = `test-${generateRandomString(RANDOM_ADDRESS_LENGTH)}@${activeDomain.domain}`;
    const password = generateRandomString(RANDOM_PASSWORD_LENGTH);

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
        console.debug('API response:', JSON.stringify(messageJson, null, JSON_INDENT));
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

  describe('forwarded email', () => {
    it('should receive forwarded email with message/rfc822 attachment', async () => {
      await sendForwardedEmail(testAccount.address);

      const EXPECTED_MESSAGE_COUNT = 4;
      const messages = await pollForMessages(testAccount.token, EXPECTED_MESSAGE_COUNT);
      const forwardedMessage = messages.find((m) => m.subject === 'Fwd: Original subject');

      expect(forwardedMessage).toBeDefined();
      expect(forwardedMessage?.hasAttachments).toBe(true);
    });

    it('should have message/rfc822 attachment with original email content', async () => {
      const EXPECTED_MESSAGE_COUNT = 4;
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
});
