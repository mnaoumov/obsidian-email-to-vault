import type { App } from 'obsidian';

import { noop } from '@mnaoumov/typescript-lib/function';
import { waitForAllAsyncOperations } from '@mnaoumov/typescript-test-toolkit/async-operation-tracking';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { Modal } from 'obsidian';
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

    const builtCommand = command.buildCommand();
    expect(builtCommand.id).toBe('redownload-recent-emails');
    expect(builtCommand.name).toBe('Redownload recent emails');
    expect(builtCommand.icon).toBe('mail-question');
  });

  it('should open modal on execute', async () => {
    const openSpy = vi.spyOn(Modal.prototype, 'open').mockImplementation(noop);
    const command = new RedownloadRecentEmailsCommandHandler({
      app: createMockApp(),
      emailChecker: createMockEmailChecker()
    });

    command.buildCommand().checkCallback?.(false);
    await waitForAllAsyncOperations();

    expect(openSpy).toHaveBeenCalledOnce();
  });
});
