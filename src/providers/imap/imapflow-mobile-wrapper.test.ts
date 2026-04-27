import {
  describe,
  expect,
  it
} from 'vitest';

import { buildWrapper } from './imapflow-mobile-wrapper.ts';

const IMAP_NOT_AVAILABLE_ON_MOBILE = 'IMAP is not available on mobile devices';

describe('imapflow-mobile-wrapper', () => {
  describe('buildWrapper', () => {
    it('should return a wrapper where connect throws', () => {
      const wrapper = buildWrapper();

      expect(() => wrapper.connect()).toThrow(IMAP_NOT_AVAILABLE_ON_MOBILE);
    });

    it('should return a wrapper where download throws', () => {
      const wrapper = buildWrapper();

      expect(() => wrapper.download('1')).toThrow(IMAP_NOT_AVAILABLE_ON_MOBILE);
    });

    it('should return a wrapper where fetch throws', () => {
      const wrapper = buildWrapper();

      expect(() => wrapper.fetch('1:*', { uid: true })).toThrow(IMAP_NOT_AVAILABLE_ON_MOBILE);
    });

    it('should return a wrapper where fetchOne throws', () => {
      const wrapper = buildWrapper();

      expect(() => wrapper.fetchOne('1', { uid: true })).toThrow(IMAP_NOT_AVAILABLE_ON_MOBILE);
    });

    it('should return a wrapper where getMailboxLock throws', () => {
      const wrapper = buildWrapper();

      expect(() => wrapper.getMailboxLock('INBOX')).toThrow(IMAP_NOT_AVAILABLE_ON_MOBILE);
    });

    it('should return a wrapper where logout throws', () => {
      const wrapper = buildWrapper();

      expect(() => wrapper.logout()).toThrow(IMAP_NOT_AVAILABLE_ON_MOBILE);
    });

    it('should return a wrapper where messageDelete throws', () => {
      const wrapper = buildWrapper();

      expect(() => wrapper.messageDelete('1', { uid: true })).toThrow(IMAP_NOT_AVAILABLE_ON_MOBILE);
    });

    it('should return a wrapper where messageFlagsAdd throws', () => {
      const wrapper = buildWrapper();

      expect(() => wrapper.messageFlagsAdd('1', ['\\Seen'], { uid: true })).toThrow(IMAP_NOT_AVAILABLE_ON_MOBILE);
    });
  });
});
