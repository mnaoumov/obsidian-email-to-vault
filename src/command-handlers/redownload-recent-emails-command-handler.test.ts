import type { App } from 'obsidian';

import { Modal } from 'obsidian';
import { noop } from 'obsidian-dev-utils/function';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { EmailCheckerComponent } from '../email-checker.ts';

import { RedownloadRecentEmailsCommandHandler } from './redownload-recent-emails-command-handler.ts';

function createMockApp(): App {
  return strictProxy<App>({});
}

function createMockEmailChecker(): EmailCheckerComponent {
  return strictProxy<EmailCheckerComponent>({
    redownloadEmails: vi.fn()
  });
}

describe('RedownloadRecentEmailsCommandHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct command properties', () => {
    const command = new RedownloadRecentEmailsCommandHandler({
      app: createMockApp(),
      emailChecker: createMockEmailChecker()
    });

    expect(command.id).toBe('redownload-recent-emails');
    expect(command.name).toBe('Redownload recent emails');
    expect(command.icon).toBe('mail-question');
  });

  it('should open modal on execute', async () => {
    const openSpy = vi.spyOn(Modal.prototype, 'open').mockImplementation(noop);
    const command = new RedownloadRecentEmailsCommandHandler({
      app: createMockApp(),
      emailChecker: createMockEmailChecker()
    });

    await command.execute();

    expect(openSpy).toHaveBeenCalledOnce();
  });
});
