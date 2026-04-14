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
const SMTP_PORT = 587;

interface TestAccount {
  address: string;
  password: string;
  token: string;
}

// eslint-disable-next-line no-restricted-globals -- Integration tests run in Node.js, not Obsidian. Using native fetch.
const nativeFetch = fetch;

async function fetchJson(url: string, options?: RequestInit): Promise<unknown> {
  const response = await nativeFetch(url, options);
  return response.json();
}

async function pollForMessage(token: string): Promise<string> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_IN_MILLISECONDS) {
    const json = await fetchJson(`${MAIL_TM_API_BASE_URL}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = mailTmMessagesResponseSchema.parse(json);
    const messages = data['hydra:member'];

    if (messages.length > 0) {
      const firstMessage = messages[0];
      if (firstMessage) {
        return firstMessage.id;
      }
    }

    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_IN_MILLISECONDS);
    });
  }

  throw new Error(`No message received within ${String(MAX_WAIT_IN_MILLISECONDS / 1000)} seconds`);
}

async function sendTestEmail(to: string): Promise<void> {
  const smtpUser = process.env['SMTP_USER'];
  const smtpPass = process.env['SMTP_PASS'];
  const smtpHost = process.env['SMTP_HOST'] ?? 'smtp.gmail.com';

  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP_USER and SMTP_PASS environment variables are required. Add them to your .env file (e.g., Gmail address + app password).');
  }

  const transport = createTransport({
    auth: {
      pass: smtpPass,
      user: smtpUser
    },
    host: smtpHost,
    port: SMTP_PORT,
    secure: false
  });

  await transport.sendMail({
    cc: 'test-cc@example.com',
    from: smtpUser,
    subject: 'Integration test email',
    text: 'This is a test email body.',
    to
  });
}

let testAccount: TestAccount;

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

  describe('GET /messages/{id} (with sent email)', () => {
    it('should receive and validate full message schema', async () => {
      await sendTestEmail(testAccount.address);

      const messageId = await pollForMessage(testAccount.token);

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

    it('should have correct sender and subject in received message', async () => {
      const json = await fetchJson(`${MAIL_TM_API_BASE_URL}/messages`, {
        headers: { Authorization: `Bearer ${testAccount.token}` }
      });
      const data = mailTmMessagesResponseSchema.parse(json);
      const firstMessage = data['hydra:member'][0];

      expect(firstMessage).toBeDefined();
      expect(firstMessage?.subject).toBe('Integration test email');
      expect(firstMessage?.from.address).toBe(process.env['SMTP_USER']);
    });
  });
});
