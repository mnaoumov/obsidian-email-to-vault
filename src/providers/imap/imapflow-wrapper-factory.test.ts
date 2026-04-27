import type { ImapFlowOptions } from 'imapflow';

import { Platform } from 'obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { ImapFlowWrapper } from './imapflow-wrapper.ts';

import { buildWrapper as buildDesktopWrapper } from './imapflow-desktop-wrapper.ts';
import { buildWrapper as buildMobileWrapper } from './imapflow-mobile-wrapper.ts';
import { buildImapFlowWrapper } from './imapflow-wrapper-factory.ts';

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    Platform: { isDesktop: true }
  };
});

const mockDesktopWrapper: ImapFlowWrapper = {
  connect: vi.fn(),
  download: vi.fn(),
  fetch: vi.fn(),
  fetchOne: vi.fn(),
  getMailboxLock: vi.fn(),
  logout: vi.fn(),
  messageDelete: vi.fn(),
  messageFlagsAdd: vi.fn()
};

const mockMobileWrapper: ImapFlowWrapper = {
  connect: vi.fn(),
  download: vi.fn(),
  fetch: vi.fn(),
  fetchOne: vi.fn(),
  getMailboxLock: vi.fn(),
  logout: vi.fn(),
  messageDelete: vi.fn(),
  messageFlagsAdd: vi.fn()
};

vi.mock('./imapflow-desktop-wrapper.ts', () => ({
  buildWrapper: vi.fn(() => mockDesktopWrapper)
}));

vi.mock('./imapflow-mobile-wrapper.ts', () => ({
  buildWrapper: vi.fn(() => mockMobileWrapper)
}));

const TEST_OPTIONS: ImapFlowOptions = {
  auth: {
    pass: 'password',
    user: 'user@example.com'
  },
  host: 'imap.example.com',
  logger: false,
  port: 993,
  secure: true
};

describe('imapflow-wrapper-factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(Platform, 'isDesktop', { value: true, writable: true });
  });

  describe('buildImapFlowWrapper', () => {
    it('should use desktop wrapper when on desktop', async () => {
      const wrapper = await buildImapFlowWrapper(TEST_OPTIONS);

      expect(wrapper).toBe(mockDesktopWrapper);
      expect(buildDesktopWrapper).toHaveBeenCalledWith(TEST_OPTIONS);
      expect(buildMobileWrapper).not.toHaveBeenCalled();
    });

    it('should use mobile wrapper when not on desktop', async () => {
      Object.defineProperty(Platform, 'isDesktop', { value: false, writable: true });

      const wrapper = await buildImapFlowWrapper(TEST_OPTIONS);

      expect(wrapper).toBe(mockMobileWrapper);
      expect(buildMobileWrapper).toHaveBeenCalledWith(TEST_OPTIONS);
      expect(buildDesktopWrapper).not.toHaveBeenCalled();
    });
  });
});
