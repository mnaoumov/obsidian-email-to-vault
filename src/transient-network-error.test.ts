import {
  describe,
  expect,
  it
} from 'vitest';

import { getTransientNetworkErrorCode } from './transient-network-error.ts';

function createErrorWithCode(message: string, code: unknown): Error {
  return Object.assign(new Error(message), { code });
}

describe('getTransientNetworkErrorCode', () => {
  it('should recognize a Chromium network error from requestUrl', () => {
    expect(getTransientNetworkErrorCode(new Error('net::ERR_CONNECTION_CLOSED'))).toBe('net::ERR_CONNECTION_CLOSED');
    expect(getTransientNetworkErrorCode(new Error('Request failed: net::ERR_INTERNET_DISCONNECTED'))).toBe('net::ERR_INTERNET_DISCONNECTED');
  });

  it('should not treat other Chromium errors as transient', () => {
    expect(getTransientNetworkErrorCode(new Error('net::ERR_CERT_AUTHORITY_INVALID'))).toBeNull();
  });

  it('should recognize Node socket and DNS error codes', () => {
    expect(getTransientNetworkErrorCode(createErrorWithCode('read ECONNRESET', 'ECONNRESET'))).toBe('ECONNRESET');
    expect(getTransientNetworkErrorCode(createErrorWithCode('getaddrinfo ENOTFOUND imap.example.com', 'ENOTFOUND'))).toBe('ENOTFOUND');
  });

  it('should recognize imapflow connection errors', () => {
    expect(getTransientNetworkErrorCode(createErrorWithCode('Connection not available', 'NoConnection'))).toBe('NoConnection');
    expect(getTransientNetworkErrorCode(createErrorWithCode('Socket timeout', 'ETIMEOUT'))).toBe('ETIMEOUT');
  });

  it('should look through the cause chain', () => {
    const error = new Error('Failed to fetch messages', { cause: new Error('net::ERR_CONNECTION_RESET') });
    expect(getTransientNetworkErrorCode(error)).toBe('net::ERR_CONNECTION_RESET');
  });

  it('should stop on a cyclic cause chain', () => {
    const error = new Error('Outer');
    Object.defineProperty(error, 'cause', { value: error });
    expect(getTransientNetworkErrorCode(error)).toBeNull();
  });

  it('should not treat other errors as transient', () => {
    expect(getTransientNetworkErrorCode(new Error('Network down'))).toBeNull();
    expect(getTransientNetworkErrorCode(createErrorWithCode('Command failed', 'NO'))).toBeNull();
    expect(getTransientNetworkErrorCode(createErrorWithCode('Weird', 42))).toBeNull();
    expect(getTransientNetworkErrorCode('net::ERR_CONNECTION_CLOSED')).toBeNull();
    expect(getTransientNetworkErrorCode(null)).toBeNull();
  });
});
