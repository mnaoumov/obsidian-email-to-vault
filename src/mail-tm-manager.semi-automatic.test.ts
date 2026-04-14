import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import { generateRandomString } from './generate-random-string.ts';
import {
  mailTmDomainsResponseSchema,
  mailTmMessageFullSchema,
  mailTmMessagesResponseSchema,
  mailTmTokenResponseSchema
} from './mail-tm-schemas.ts';

const IS_CI = Boolean(process.env['CI']);

const MAIL_TM_API_BASE_URL = 'https://api.mail.tm';
const RANDOM_ADDRESS_LENGTH = 10;
const RANDOM_PASSWORD_LENGTH = 20;
const POLL_INTERVAL_IN_MILLISECONDS = 3000;
const MAX_WAIT_IN_MILLISECONDS = 90_000;

interface TestAccount {
  address: string;
  password: string;
  token: string;
}

// eslint-disable-next-line no-restricted-globals -- Semi-automatic tests run in Node.js, not Obsidian. Using native fetch.
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

let testAccount: TestAccount;

describe.skipIf(IS_CI)('Mail.tm message schema (semi-automatic)', () => {
  beforeAll(async () => {
    const domainsJson = await fetchJson(`${MAIL_TM_API_BASE_URL}/domains`);
    const domainsData = mailTmDomainsResponseSchema.parse(domainsJson);
    const activeDomain = domainsData['hydra:member'].find((d) => d.isActive);

    if (!activeDomain) {
      throw new Error('No active Mail.tm domains available');
    }

    const address = `test-${generateRandomString(RANDOM_ADDRESS_LENGTH)}@${activeDomain.domain}`;
    const password = generateRandomString(RANDOM_PASSWORD_LENGTH);

    await fetchJson(`${MAIL_TM_API_BASE_URL}/accounts`, {
      body: JSON.stringify({ address, password }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    });

    const tokenJson = await fetchJson(`${MAIL_TM_API_BASE_URL}/token`, {
      body: JSON.stringify({ address, password }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    });
    const tokenData = mailTmTokenResponseSchema.parse(tokenJson);

    testAccount = { address, password, token: tokenData.token };

    console.warn([
      '',
      '='.repeat(60),
      `  Send an email to: ${address}`,
      `  Waiting up to ${String(MAX_WAIT_IN_MILLISECONDS / 1000)} seconds...`,
      '='.repeat(60),
      ''
    ].join('\n'));
  });

  afterAll(async () => {
    if (testAccount.token) {
      await nativeFetch(`${MAIL_TM_API_BASE_URL}/me`, {
        headers: { Authorization: `Bearer ${testAccount.token}` },
        method: 'DELETE'
      });
    }
  });

  it('should receive a message matching the full message schema', async () => {
    const messageId = await pollForMessage(testAccount.token);

    const messageJson = await fetchJson(`${MAIL_TM_API_BASE_URL}/messages/${messageId}`, {
      headers: { Authorization: `Bearer ${testAccount.token}` }
    });

    const JSON_INDENT = 2;
    console.debug('API response:', JSON.stringify(messageJson, null, JSON_INDENT));

    const result = mailTmMessageFullSchema.safeParse(messageJson);

    if (!result.success) {
      console.error('Schema validation errors:', JSON.stringify(result.error.issues, null, JSON_INDENT));
    }

    expect(result.success).toBe(true);
  });

  it('should have expected fields populated in received message', async () => {
    const messageId = await pollForMessage(testAccount.token);

    const messageJson = await fetchJson(`${MAIL_TM_API_BASE_URL}/messages/${messageId}`, {
      headers: { Authorization: `Bearer ${testAccount.token}` }
    });
    const message = mailTmMessageFullSchema.parse(messageJson);

    expect(message.from.address).toBeTruthy();
    expect(message.subject).toBeDefined();
    expect(message.to.length).toBeGreaterThan(0);
    expect(message.text.length + message.html.length).toBeGreaterThan(0);
  });
});
