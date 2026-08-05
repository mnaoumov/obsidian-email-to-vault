import type { RequestUrlResponse } from 'obsidian';

import { requestUrl } from 'obsidian';
import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { MailTmDomainManager } from './mail-tm-domain-manager.ts';

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    requestUrl: vi.fn()
  };
});

const mockRequestUrl = vi.mocked(requestUrl);

describe('MailTmDomainManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAvailableDomain', () => {
    it('should return the first active domain', async () => {
      const manager = new MailTmDomainManager();

      mockRequestUrl.mockResolvedValueOnce(castTo<RequestUrlResponse>({
        json: { 'hydra:member': [{ domain: 'mail.tm', isActive: true }] }
      }));

      const result = await manager.getAvailableDomain();

      expect(result).toBe('mail.tm');
    });

    it('should throw when no active domains available', async () => {
      const manager = new MailTmDomainManager();

      mockRequestUrl.mockResolvedValueOnce(castTo<RequestUrlResponse>({
        json: { 'hydra:member': [{ domain: 'mail.tm', isActive: false }] }
      }));

      await expect(manager.getAvailableDomain()).rejects.toThrow('No active Mail.tm domains available');
    });
  });

  describe('validateEmailDomain', () => {
    it('should return true for valid active domain', async () => {
      const manager = new MailTmDomainManager();

      mockRequestUrl.mockResolvedValueOnce(castTo<RequestUrlResponse>({
        json: { 'hydra:member': [{ domain: 'mail.tm', isActive: true }] }
      }));

      const isResult = await manager.validateEmailDomain('user@mail.tm');

      expect(isResult).toBe(true);
    });

    it('should return false for inactive domain', async () => {
      const manager = new MailTmDomainManager();

      mockRequestUrl.mockResolvedValueOnce(castTo<RequestUrlResponse>({
        json: { 'hydra:member': [{ domain: 'mail.tm', isActive: false }] }
      }));

      const isResult = await manager.validateEmailDomain('user@mail.tm');

      expect(isResult).toBe(false);
    });

    it('should return false for unknown domain', async () => {
      const manager = new MailTmDomainManager();

      mockRequestUrl.mockResolvedValueOnce(castTo<RequestUrlResponse>({
        json: { 'hydra:member': [{ domain: 'mail.tm', isActive: true }] }
      }));

      const isResult = await manager.validateEmailDomain('user@other.com');

      expect(isResult).toBe(false);
    });

    it('should return false for address without domain', async () => {
      const manager = new MailTmDomainManager();

      const isResult = await manager.validateEmailDomain('nodomain');

      expect(isResult).toBe(false);
    });
  });
});
