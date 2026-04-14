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

import { RedownloadRecentEmailsCommand } from './redownload-recent-emails-command.ts';

interface MockCommandBaseParams {
  icon: string;
  id: string;
  name: string;
  plugin: unknown;
}

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    Modal: class MockModal {
      protected contentEl = {
        createEl: vi.fn(() => ({
          addEventListener: vi.fn(),
          style: {},
          value: '0'
        })),
        empty: vi.fn()
      };

      public constructor(protected readonly _app: unknown) {}

      public close(): void {
        noop();
      }

      public open(): void {
        noop();
      }
    }
  };
});

vi.mock('obsidian-dev-utils/async', () => ({
  convertAsyncToSync: vi.fn((fn: () => unknown) => fn)
}));

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

describe('RedownloadRecentEmailsCommand', () => {
  it('should have correct command properties', () => {
    const command = new RedownloadRecentEmailsCommand(createMockPlugin(), createMockEmailChecker());

    expect(command.id).toBe('redownload-recent-emails');
    expect(command.name).toBe('Redownload recent emails');
    expect(command.icon).toBe('mail-question');
  });

  it('should create command invocation', () => {
    const checker = createMockEmailChecker();
    const command = new RedownloadRecentEmailsCommand(createMockPlugin(), checker);

    const invocation = command.createCommandInvocation();

    expect(invocation).toBeDefined();
  });
});
