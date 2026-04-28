import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { EmailChecker } from '../email-checker.ts';

import { CheckEmailsCommandHandler } from './check-emails-command-handler.ts';

interface CommandHandlerParams {
  icon: string;
  id: string;
  name: string;
  pluginName: string;
}

vi.mock('obsidian-dev-utils/obsidian/command-handlers/global-command-handler', () => ({
  GlobalCommandHandler: class MockGlobalCommandHandler {
    public icon: string;
    public id: string;
    public name: string;
    public pluginName: string;
    public constructor(params: CommandHandlerParams) {
      this.icon = params.icon;
      this.id = params.id;
      this.name = params.name;
      this.pluginName = params.pluginName;
    }
  }
}));

function createMockEmailChecker(): EmailChecker {
  return strictProxy<EmailChecker>({
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
