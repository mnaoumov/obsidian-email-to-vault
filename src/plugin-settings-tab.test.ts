import { SecretComponent } from 'obsidian';
import { noop } from 'obsidian-dev-utils/function';
import { SettingGroupEx } from 'obsidian-dev-utils/obsidian/setting-group-ex';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { MailTmManager } from './mail-tm-manager.ts';
import type { Plugin } from './plugin.ts';

import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { PluginSettings } from './plugin-settings.ts';

const captured = vi.hoisted(() => ({
  buttons: [] as Record<string, ReturnType<typeof vi.fn>>[],
  secretComponents: [] as Record<string, ReturnType<typeof vi.fn>>[]
}));

interface MockPluginConstructorParams {
  app?: unknown;
}

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin-settings-tab-base', () => ({
  PluginSettingsTabBase: class MockPluginSettingsTabBase {
    public app: unknown;
    public containerEl: HTMLElement;
    public plugin: unknown;
    public constructor(plugin: MockPluginConstructorParams) {
      this.plugin = plugin;
      this.app = plugin.app;
      this.containerEl = document.createElement('div');
    }

    public bind(): void {
      noop();
    }

    public display(): void {
      noop();
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/setting-group-ex', () => ({
  SettingGroupEx: vi.fn(function settingGroupExMock(this: Record<string, unknown>) {
    this['setHeading'] = vi.fn(() => this);
    this['addSettingEx'] = vi.fn((cb: (s: Record<string, unknown>) => void) => {
      const s: Record<string, unknown> = {
        settingEl: document.createElement('div')
      };
      s['setName'] = vi.fn(() => s);
      s['setDesc'] = vi.fn(() => s);
      s['addEmail'] = vi.fn((emailCb: (c: unknown) => void) => {
        emailCb({});
        return s;
      });
      s['addButton'] = vi.fn((btnCb: (b: Record<string, unknown>) => void) => {
        const btn: Record<string, ReturnType<typeof vi.fn>> = {
          onClick: vi.fn(() => btn),
          setButtonText: vi.fn(() => btn),
          setDisabled: vi.fn(() => btn)
        };
        captured.buttons.push(btn);
        btnCb(btn);
        return s;
      });
      s['addNumber'] = vi.fn((numCb: (c: unknown) => void) => {
        numCb({});
        return s;
      });
      s['addText'] = vi.fn((textCb: (c: unknown) => void) => {
        textCb({});
        return s;
      });
      s['addTextArea'] = vi.fn((textAreaCb: (c: unknown) => void) => {
        textAreaCb({});
        return s;
      });
      cb(s);
      return this;
    });
  })
}));

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    SecretComponent: vi.fn(function secretComponentMock(this: Record<string, ReturnType<typeof vi.fn>>) {
      this['onChange'] = vi.fn();
      this['setValue'] = vi.fn();
      captured.secretComponents.push(this);
    })
  };
});

vi.mock('obsidian-dev-utils/async', () => ({
  convertAsyncToSync: vi.fn((fn: (...args: unknown[]) => unknown) => fn)
}));

const MockSettingGroupEx = vi.mocked(SettingGroupEx);
const MockSecretComponent = vi.mocked(SecretComponent);

interface MockPluginOverrides {
  emailAddress?: string;
}

function createMockMailTmManager(): MailTmManager {
  return strictProxy<MailTmManager>({
    getNewEmailAddress: vi.fn()
  });
}

function createMockPlugin(overrides?: MockPluginOverrides): Plugin {
  return strictProxy<Plugin>({
    app: {},
    settings: {
      emailAddress: overrides?.emailAddress ?? '',
      emailPasswordSecretKey: 'test-key'
    },
    settingsManager: {
      editAndSave: vi.fn()
    }
  });
}

describe('PluginSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.buttons.length = 0;
    captured.secretComponents.length = 0;
  });

  describe('display', () => {
    it('should create two setting groups with correct headings', () => {
      const tab = new PluginSettingsTab(createMockPlugin(), createMockMailTmManager());

      tab.display();

      expect(MockSettingGroupEx).toHaveBeenCalledTimes(2);
      const group1 = ensureNonNullable(MockSettingGroupEx.mock.instances[0]);
      const group2 = ensureNonNullable(MockSettingGroupEx.mock.instances[1]);
      expect(group1.setHeading).toHaveBeenCalledWith('Mail.tm');
      expect(group2.setHeading).toHaveBeenCalledWith('Main');
    });

    it('should pass containerEl to SettingGroupEx', () => {
      const tab = new PluginSettingsTab(createMockPlugin(), createMockMailTmManager());

      tab.display();

      expect(MockSettingGroupEx).toHaveBeenNthCalledWith(1, tab.containerEl);
      expect(MockSettingGroupEx).toHaveBeenNthCalledWith(2, tab.containerEl);
    });

    it('should enable get email button when no address configured', () => {
      const tab = new PluginSettingsTab(createMockPlugin({ emailAddress: '' }), createMockMailTmManager());

      tab.display();

      expect(ensureNonNullable(captured.buttons[0])['setDisabled']).toHaveBeenCalledWith(false);
    });

    it('should disable get email button when address exists', () => {
      const tab = new PluginSettingsTab(createMockPlugin({ emailAddress: 'test@mail.tm' }), createMockMailTmManager());

      tab.display();

      expect(ensureNonNullable(captured.buttons[0])['setDisabled']).toHaveBeenCalledWith(true);
    });

    it('should call getNewEmailAddress on button click', async () => {
      const manager = createMockMailTmManager();
      const tab = new PluginSettingsTab(createMockPlugin(), manager);
      tab.display();
      vi.spyOn(tab, 'display').mockImplementation(noop);

      const button = ensureNonNullable(captured.buttons[0]);
      const onClickMock = ensureNonNullable(button['onClick']);
      const onClick = ensureNonNullable(onClickMock.mock.calls[0])[0] as () => Promise<void>;
      await onClick();

      expect(manager.getNewEmailAddress).toHaveBeenCalledOnce();
    });

    it('should refresh display after getting new email address', async () => {
      const tab = new PluginSettingsTab(createMockPlugin(), createMockMailTmManager());
      tab.display();
      const displaySpy = vi.spyOn(tab, 'display').mockImplementation(noop);

      const button = ensureNonNullable(captured.buttons[0]);
      const onClickMock = ensureNonNullable(button['onClick']);
      const onClick = ensureNonNullable(onClickMock.mock.calls[0])[0] as () => Promise<void>;
      await onClick();

      expect(displaySpy).toHaveBeenCalledOnce();
    });

    it('should set SecretComponent with current password key', () => {
      const tab = new PluginSettingsTab(createMockPlugin(), createMockMailTmManager());

      tab.display();

      expect(MockSecretComponent).toHaveBeenCalledOnce();
      expect(ensureNonNullable(captured.secretComponents[0])['setValue']).toHaveBeenCalledWith('test-key');
    });

    it('should save password key on SecretComponent change', async () => {
      const plugin = createMockPlugin();
      const editAndSaveMock = vi.mocked(plugin.settingsManager.editAndSave);
      editAndSaveMock.mockImplementation(async (settingsEditor) => {
        const settings = new PluginSettings();
        await settingsEditor(settings);
        expect(settings.emailPasswordSecretKey).toBe('new-key');
      });
      const tab = new PluginSettingsTab(plugin, createMockMailTmManager());
      tab.display();

      const secretComponent = ensureNonNullable(captured.secretComponents[0]);
      const onChangeMock = ensureNonNullable(secretComponent['onChange']);
      const onChange = ensureNonNullable(onChangeMock.mock.calls[0])[0] as (value: string) => Promise<void>;
      await onChange('new-key');

      expect(editAndSaveMock).toHaveBeenCalledOnce();
    });
  });
});
