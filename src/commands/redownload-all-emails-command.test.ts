import { noop } from 'obsidian-dev-utils/function';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { EmailChecker } from '../email-checker.ts';
import type { Plugin } from '../plugin.ts';

import { RedownloadAllEmailsCommand } from './redownload-all-emails-command.ts';

interface MockCommandBaseParams {
  icon: string;
  id: string;
  name: string;
  plugin: unknown;
}

vi.mock('obsidian-dev-utils/obsidian/commands/command-base', () => ({
  CommandInvocationBase: class MockCommandInvocationBase {
    protected app: unknown;
    public constructor(protected readonly plugin: unknown) {}
  }
}));

vi.mock('obsidian-dev-utils/obsidian/commands/non-editor-command-base', () => ({
  NonEditorCommandBase: class MockNonEditorCommandBase {
    public icon: string;
    public id: string;
    public name: string;
    protected plugin: unknown;
    public constructor(params: MockCommandBaseParams) {
      this.icon = params.icon;
      this.id = params.id;
      this.name = params.name;
      this.plugin = params.plugin;
    }

    public register(): void {
      noop();
    }
  }
}));

function createMockEmailChecker(): EmailChecker {
  return strictProxy<EmailChecker>({
    redownloadEmails: vi.fn()
  });
}

function createMockPlugin(): Plugin {
  return strictProxy<Plugin>({});
}

describe('RedownloadAllEmailsCommand', () => {
  it('should have correct command properties', () => {
    const command = new RedownloadAllEmailsCommand(createMockPlugin(), createMockEmailChecker());

    expect(command.id).toBe('redownload-all-emails');
    expect(command.name).toBe('Redownload all emails');
    expect(command.icon).toBe('mail-search');
  });

  it('should call redownloadEmails without count on execute', async () => {
    const checker = createMockEmailChecker();
    const command = new RedownloadAllEmailsCommand(createMockPlugin(), checker);

    await command.createCommandInvocation()['execute']();

    expect(checker.redownloadEmails).toHaveBeenCalledOnce();
    expect(checker.redownloadEmails).toHaveBeenCalledWith();
  });
});
