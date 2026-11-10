/**
 * The mail service refused a request because this device asked too often (HTTP `429 Too Many Requests`).
 *
 * It says nothing about the plugin or the mailbox: a scheduled check that hits it is skipped and backed off, and a
 * command the user ran says to try again later, instead of either one reporting an unhandled error.
 */
export class EmailProviderRateLimitError extends Error {
  public override name = 'EmailProviderRateLimitError';

  /**
   * Creates the error.
   *
   * @param message - The error message.
   * @param retryAfterInMilliseconds - How long the service asked to wait before the next request, or `null` when it did not say.
   */
  public constructor(message: string, public readonly retryAfterInMilliseconds: null | number) {
    super(message);
  }
}
