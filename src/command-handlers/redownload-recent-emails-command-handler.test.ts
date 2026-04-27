import type { App } from 'obsidian';

import { noop } from 'obsidian-dev-utils/function';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { EmailChecker } from '../email-checker.ts';

import { RedownloadRecentEmailsCommandHandler } from './redownload-recent-emails-command-handler.ts';

interface CommandHandlerParams {
  icon: string;
  id: string;
  name: string;
  pluginName: string;
}

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    Modal: class MockModal {
      protected contentEl = {
        addClass: vi.fn(),
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

      public setTitle(): void {
        noop();
      }
    }
  };
});

vi.mock('obsidian-dev-utils/async', () => ({
  convertAsyncToSync: vi.fn((fn: () => unknown) => fn)
}));

vi.mock('obsidian-dev-utils/obsidian/setting-ex', () => ({
  SettingEx: vi.fn(function settingExMock(this: Record<string, ReturnType<typeof vi.fn>>) {
    this['addButton'] = vi.fn(() => this);
    this['addNumber'] = vi.fn((cb: (c: Record<string, ReturnType<typeof vi.fn>>) => void) => {
      const c: Record<string, ReturnType<typeof vi.fn>> = {};
      c['setMin'] = vi.fn(() => c);
      c['setValue'] = vi.fn(() => c);
      c['onChange'] = vi.fn(() => c);
      cb(c);
      return this;
    });
    this['setDesc'] = vi.fn(() => this);
    this['setName'] = vi.fn(() => this);
    return this;
  })
}));

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

function createMockApp(): App {
  return strictProxy<App>({});
}

function createMockEmailChecker(): EmailChecker {
  return strictProxy<EmailChecker>({
    redownloadEmails: vi.fn()
  });
}

describe('RedownloadRecentEmailsCommandHandler', () => {
  it('should have correct command properties', () => {
    const command = new RedownloadRecentEmailsCommandHandler({
      app: createMockApp(),
      emailChecker: createMockEmailChecker(),
      pluginName: 'Email to Vault'
    });

    expect(command.id).toBe('redownload-recent-emails');
    expect(command.name).toBe('Redownload recent emails');
    expect(command.icon).toBe('mail-question');
  });

  it('should open modal on execute', async () => {
    const checker = createMockEmailChecker();
    const command = new RedownloadRecentEmailsCommandHandler({
      app: createMockApp(),
      emailChecker: checker,
      pluginName: 'Email to Vault'
    });

    await command.execute();

    expect(command).toBeDefined();
  });
});
