/**
 * The mail service refused this device's credentials, or this device has none.
 *
 * Its message is written for the user and says what to do, so it is shown as a notice rather than left in the console:
 * an error thrown out of a command reaches the console only, and the user saw nothing after "Checking emails..." (#10).
 */
export class EmailProviderAuthenticationError extends Error {
  public override name = 'EmailProviderAuthenticationError';
}
