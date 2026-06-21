import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { EmailCheckerComponent } from '../email-checker.ts';

import { CheckEmailsCommandHandler } from './check-emails-command-handler.ts';

function createMockEmailChecker(): EmailCheckerComponent {
  return strictProxy<EmailCheckerComponent>({
    checkEmails: vi.fn()
  });
}

describe('CheckEmailsCommandHandler', () => {
  it('should have correct command properties', () => {
    const command = new CheckEmailsCommandHandler(createMockEmailChecker());

    expect(command.id).toBe('check-emails');
    expect(command.name).toBe('Check emails');
    expect(command.icon).toBe('mail');
  });

  it('should call checkEmails on execute', async () => {
    const checker = createMockEmailChecker();
    const command = new CheckEmailsCommandHandler(checker);

    await command.execute();

    expect(checker.checkEmails).toHaveBeenCalledOnce();
  });
});
