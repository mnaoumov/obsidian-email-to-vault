import type { RequestUrlResponse } from 'obsidian';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { requestUrl } from 'obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { EmailProviderRateLimitError } from '../email-provider-rate-limit-error.ts';
import {
  parseRetryAfterInMilliseconds,
  requestMailTm
} from './mail-tm-request.ts';

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    requestUrl: vi.fn()
  };
});

const mockRequestUrl = vi.mocked(requestUrl);

const URL = 'https://api.mail.tm/messages';

async function getRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the promise to reject');
}

describe('requestMailTm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send the request without letting requestUrl throw, and return a successful response', async () => {
    const response = castTo<RequestUrlResponse>({ status: 200 });
    mockRequestUrl.mockResolvedValueOnce(response);

    await expect(requestMailTm({ method: 'GET', url: URL })).resolves.toBe(response);

    expect(mockRequestUrl).toHaveBeenCalledWith({ method: 'GET', throw: false, url: URL });
  });

  it('should turn a 429 into a rate-limit error carrying the Retry-After delay, whatever the header case', async () => {
    mockRequestUrl.mockResolvedValueOnce(castTo<RequestUrlResponse>({ headers: { 'content-type': 'text/plain', 'retry-after': '7' }, status: 429 }));

    const error = await getRejection(requestMailTm({ method: 'PATCH', url: URL }));

    expect(error).toBeInstanceOf(EmailProviderRateLimitError);
    expect(error).toMatchObject({
      message: `Mail.tm is limiting requests from this device (HTTP 429) on PATCH ${URL}`,
      retryAfterInMilliseconds: 7000
    });
  });

  it('should turn a 429 without Retry-After into a rate-limit error with no delay', async () => {
    mockRequestUrl.mockResolvedValueOnce(castTo<RequestUrlResponse>({ headers: {}, status: 429 }));

    const error = await getRejection(requestMailTm({ url: URL }));

    expect(error).toBeInstanceOf(EmailProviderRateLimitError);
    expect(error).toMatchObject({
      message: `Mail.tm is limiting requests from this device (HTTP 429) on GET ${URL}`,
      retryAfterInMilliseconds: null
    });
  });

  it('should throw a plain error on any other failing status', async () => {
    mockRequestUrl.mockResolvedValueOnce(castTo<RequestUrlResponse>({ status: 404 }));

    await expect(requestMailTm({ url: URL })).rejects.toThrow(`Mail.tm request failed with status 404: GET ${URL}`);
  });

  it('should return a failing status the caller handles itself', async () => {
    const response = castTo<RequestUrlResponse>({ status: 401 });
    mockRequestUrl.mockResolvedValueOnce(response);

    await expect(requestMailTm({ allowedErrorStatuses: [401], method: 'POST', url: URL })).resolves.toBe(response);

    expect(mockRequestUrl).toHaveBeenCalledWith({ method: 'POST', throw: false, url: URL });
  });

  it('should still treat a 429 as a rate limit when the caller allows it', async () => {
    mockRequestUrl.mockResolvedValueOnce(castTo<RequestUrlResponse>({ headers: {}, status: 429 }));

    await expect(requestMailTm({ allowedErrorStatuses: [429], url: URL })).rejects.toBeInstanceOf(EmailProviderRateLimitError);
  });
});

describe('parseRetryAfterInMilliseconds', () => {
  const NOW = Date.parse('2026-11-10T06:00:00Z');

  it('should read a number of seconds', () => {
    expect(parseRetryAfterInMilliseconds(' 120 ', NOW)).toBe(120_000);
    expect(parseRetryAfterInMilliseconds('0', NOW)).toBe(0);
  });

  it('should read an HTTP date as the time left until it', () => {
    expect(parseRetryAfterInMilliseconds('Tue, 10 Nov 2026 06:00:30 GMT', NOW)).toBe(30_000);
  });

  it('should never return a negative delay for a date in the past', () => {
    expect(parseRetryAfterInMilliseconds('Tue, 10 Nov 2026 05:59:00 GMT', NOW)).toBe(0);
  });

  it('should return null for a missing, empty or unreadable value', () => {
    expect(parseRetryAfterInMilliseconds(undefined, NOW)).toBeNull();
    expect(parseRetryAfterInMilliseconds(' '.repeat(3), NOW)).toBeNull();
    expect(parseRetryAfterInMilliseconds('soon', NOW)).toBeNull();
  });
});
