import {
  describe,
  expect,
  it
} from 'vitest';

import { generateRandomString } from './generate-random-string.ts';

describe('generateRandomString', () => {
  it('should return string of requested length', () => {
    const LENGTH = 15;
    const result = generateRandomString(LENGTH);

    expect(result).toHaveLength(LENGTH);
  });

  it('should only contain lowercase alphanumeric characters', () => {
    const result = generateRandomString(100);

    expect(result).toMatch(/^[a-z0-9]+$/);
  });

  it('should return empty string for length 0', () => {
    const result = generateRandomString(0);

    expect(result).toBe('');
  });
});
