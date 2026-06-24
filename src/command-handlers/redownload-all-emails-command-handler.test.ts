import { waitForAllAsyncOperations } from 'obsidian-dev-utils/async';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { EmailCheckerComponent } from '../email-checker.ts';

import { RedownloadAllEmailsCommandHandler } from './redownload-all-emails-command-handler.ts';

function createMockEmailChecker(): EmailCheckerComponent {
  return strictProxy<EmailCheckerComponent>({
    redownloadEmails: vi.fn()
  });
}

describe('RedownloadAllEmailsCommandHandler', () => {
  it('should have correct command properties', () => {
    const command = new RedownloadAllEmailsCommandHandler(createMockEmailChecker());

    const builtCommand = command.buildCommand();
    expect(builtCommand.id).toBe('redownload-all-emails');
    expect(builtCommand.name).toBe('Redownload all emails');
    expect(builtCommand.icon).toBe('mail-search');
  });

  it('should call redownloadEmails without count on execute', async () => {
    const checker = createMockEmailChecker();
    const command = new RedownloadAllEmailsCommandHandler(checker);

    command.buildCommand().checkCallback?.(false);
    await waitForAllAsyncOperations();

    expect(checker.redownloadEmails).toHaveBeenCalledOnce();
    expect(checker.redownloadEmails).toHaveBeenCalledWith();
  });
});
