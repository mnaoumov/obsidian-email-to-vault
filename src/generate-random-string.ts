import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateRandomString(length: number): string {
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (const byte of array) {
    const char = ensureNonNullable(CHARS[byte % CHARS.length]);
    result += char;
  }
  return result;
}
