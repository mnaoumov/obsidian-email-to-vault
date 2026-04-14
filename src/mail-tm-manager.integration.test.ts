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
  mailTmMessagesResponseSchema,
  mailTmTokenResponseSchema
} from './mail-tm-schemas.ts';

const MAIL_TM_API_BASE_URL = 'https://api.mail.tm';
const RANDOM_ADDRESS_LENGTH = 10;
const RANDOM_PASSWORD_LENGTH = 20;

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

    it('should return empty list for new account', async () => {
      const json = await fetchJson(`${MAIL_TM_API_BASE_URL}/messages`, {
        headers: { Authorization: `Bearer ${testAccount.token}` }
      });
      const data = mailTmMessagesResponseSchema.parse(json);

      expect(data['hydra:member']).toHaveLength(0);
    });
  });
});
