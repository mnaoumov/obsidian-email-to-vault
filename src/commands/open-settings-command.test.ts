import { noop } from 'obsidian-dev-utils/function';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { Plugin } from '../plugin.ts';

import { OpenSettingsCommand } from './open-settings-command.ts';

interface MockCommandBaseParams {
  icon: string;
  id: string;
  name: string;
  plugin: unknown;
}

interface MockPluginWithApp {
  app: unknown;
}

vi.mock('obsidian-dev-utils/obsidian/commands/command-base', () => ({
  CommandInvocationBase: class MockCommandInvocationBase {
    protected app: unknown;
    public constructor(protected readonly plugin: MockPluginWithApp) {
      this.app = plugin.app;
    }
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

function createMockPlugin(): Plugin {
  return strictProxy<Plugin>({
    app: {
      setting: {
        open: vi.fn(),
        openTabById: vi.fn()
      }
    },
    manifest: { id: 'email-to-vault' }
  });
}

describe('OpenSettingsCommand', () => {
  it('should have correct command properties', () => {
    const command = new OpenSettingsCommand(createMockPlugin());

    expect(command.id).toBe('open-settings');
    expect(command.name).toBe('Open settings');
    expect(command.icon).toBe('settings');
  });

  it('should open settings tab on execute', async () => {
    const plugin = createMockPlugin();
    const command = new OpenSettingsCommand(plugin);

    await command['createCommandInvocation']()['execute']();

    expect(plugin.app.setting.openTabById).toHaveBeenCalledWith('email-to-vault');
    expect(plugin.app.setting.open).toHaveBeenCalledOnce();
  });
});
