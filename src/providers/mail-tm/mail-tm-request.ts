/**
 * @file
 *
 * Sends a request to the Mail.tm API. The API answers bursts with `429 Too Many Requests` and an empty body, and that
 * answer becomes an {@link EmailProviderRateLimitError} carrying the `Retry-After` delay, so a caller can tell it apart
 * from a real failure.
 */

import type {
  RequestUrlParam,
  RequestUrlResponse
} from 'obsidian';

import { requestUrl } from 'obsidian';

import { EmailProviderRateLimitError } from '../email-provider-rate-limit-error.ts';

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
const MILLISECONDS_PER_SECOND = 1000;
const RETRY_AFTER_SECONDS_PATTERN = /^\d+$/u;

/**
 * The statuses of 400 and above the caller handles itself, so they are returned rather than thrown.
 */
export interface RequestMailTmParams extends RequestUrlParam {
  readonly allowedErrorStatuses?: readonly number[];
}

/**
 * Parses a `Retry-After` header: a whole number of seconds, or an HTTP date.
 *
 * @param value - The header value.
 * @param now - The current time, in milliseconds since the epoch.
 * @returns The delay in milliseconds (never negative), or `null` when the value is missing or unreadable.
 */
export function parseRetryAfterInMilliseconds(value: string | undefined, now: number): null | number {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') {
    return null;
  }

  if (RETRY_AFTER_SECONDS_PATTERN.test(trimmed)) {
    return Number(trimmed) * MILLISECONDS_PER_SECOND;
  }

  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? null : Math.max(date - now, 0);
}

/**
 * Sends a request to the Mail.tm API.
 *
 * @param params - The request; `allowedErrorStatuses` lists the statuses of 400 and above the caller handles itself.
 * @returns The response.
 * @throws {@link EmailProviderRateLimitError} on a 429, and an `Error` on any other status of 400 and above not allowed.
 */
export async function requestMailTm(params: RequestMailTmParams): Promise<RequestUrlResponse> {
  const { allowedErrorStatuses = [], ...requestParams } = params;
  const response = await requestUrl({ ...requestParams, throw: false });

  if (response.status === HTTP_STATUS_TOO_MANY_REQUESTS) {
    const retryAfterInMilliseconds = parseRetryAfterInMilliseconds(getHeader(response, 'Retry-After'), Date.now());
    throw new EmailProviderRateLimitError(
      `Mail.tm is limiting requests from this device (HTTP 429) on ${requestParams.method ?? 'GET'} ${requestParams.url}`,
      retryAfterInMilliseconds
    );
  }

  if (response.status >= HTTP_STATUS_BAD_REQUEST && !allowedErrorStatuses.includes(response.status)) {
    throw new Error(`Mail.tm request failed with status ${String(response.status)}: ${requestParams.method ?? 'GET'} ${requestParams.url}`);
  }

  return response;
}

// `requestUrl` does not promise the case of header names, and HTTP header names are case-insensitive.
function getHeader(response: RequestUrlResponse, name: string): string | undefined {
  const lowerCaseName = name.toLowerCase();
  for (const [key, value] of Object.entries(response.headers)) {
    if (key.toLowerCase() === lowerCaseName) {
      return value;
    }
  }
  return undefined;
}
