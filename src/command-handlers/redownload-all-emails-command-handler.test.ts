import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { EmailChecker } from '../email-checker.ts';

import { RedownloadAllEmailsCommandHandler } from './redownload-all-emails-command-handler.ts';

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
    redownloadEmails: vi.fn()
  });
}

describe('RedownloadAllEmailsCommandHandler', () => {
  it('should have correct command properties', () => {
    const command = new RedownloadAllEmailsCommandHandler(createMockEmailChecker());

    expect(command.id).toBe('redownload-all-emails');
    expect(command.name).toBe('Redownload all emails');
    expect(command.icon).toBe('mail-search');
  });

  it('should call redownloadEmails without count on execute', async () => {
    const checker = createMockEmailChecker();
    const command = new RedownloadAllEmailsCommandHandler(checker);

    await command.execute();

    expect(checker.redownloadEmails).toHaveBeenCalledOnce();
    expect(checker.redownloadEmails).toHaveBeenCalledWith();
  });
});
