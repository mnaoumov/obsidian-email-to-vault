/**
 * @file
 *
 * Recognizes the network failures that say nothing about the plugin or the mailbox: the connection dropped, timed out,
 * or the device is offline. A scheduled check that hits one simply tries again later, instead of reporting an error.
 */

// Chromium's error names, which `requestUrl` puts in its message as `net::ERR_<name>` (Mail.tm, IMAP on mobile).
const TRANSIENT_CHROMIUM_ERROR_NAMES = new Set([
  'ADDRESS_UNREACHABLE',
  'CONNECTION_ABORTED',
  'CONNECTION_CLOSED',
  'CONNECTION_FAILED',
  'CONNECTION_REFUSED',
  'CONNECTION_RESET',
  'CONNECTION_TIMED_OUT',
  'EMPTY_RESPONSE',
  'INTERNET_DISCONNECTED',
  'NAME_NOT_RESOLVED',
  'NAME_RESOLUTION_FAILED',
  'NETWORK_CHANGED',
  'NETWORK_IO_SUSPENDED',
  'TIMED_OUT'
]);

// The `code` of Node's socket and DNS errors, and of the connection and timeout errors of `imapflow` (desktop IMAP).
const TRANSIENT_ERROR_CODES = new Set([
  'ClosedAfterConnectText',
  'ClosedAfterConnectTLS',
  'CONNECT_TIMEOUT',
  'EAI_AGAIN',
  'ECONNABORTED',
  'EConnectionClosed',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETHROTTLE',
  'ETIMEDOUT',
  'ETIMEOUT',
  'GREETING_TIMEOUT',
  'NoConnection',
  'UPGRADE_TIMEOUT'
]);

const CHROMIUM_ERROR_PATTERN = /net::ERR_(?<name>[A-Z_]+)/u;

/**
 * Returns the code of a transient network failure, looking through the error's `cause` chain.
 *
 * @param error - The error to examine.
 * @returns The code (`net::ERR_CONNECTION_CLOSED`, `ECONNRESET`, ...), or `null` when the error is not a transient network failure.
 */
export function getTransientNetworkErrorCode(error: unknown): null | string {
  const visited = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);
    const code = getTransientCode(current);
    if (code !== null) {
      return code;
    }
    current = current.cause;
  }
  return null;
}

function getTransientCode(error: Error): null | string {
  const code = 'code' in error ? error.code : undefined;
  if (typeof code === 'string' && TRANSIENT_ERROR_CODES.has(code)) {
    return code;
  }

  const name = CHROMIUM_ERROR_PATTERN.exec(error.message)?.groups?.['name'];
  return name !== undefined && TRANSIENT_CHROMIUM_ERROR_NAMES.has(name) ? `net::ERR_${name}` : null;
}
