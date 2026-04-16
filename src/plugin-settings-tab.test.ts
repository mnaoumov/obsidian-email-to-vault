import { noop } from 'obsidian-dev-utils/function';
import { confirm } from 'obsidian-dev-utils/obsidian/modals/confirm';
import { SettingGroupEx } from 'obsidian-dev-utils/obsidian/setting-group-ex';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';
import {
  afterEach,
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
  emailComponents: [] as Record<string, ReturnType<typeof vi.fn>>[],
  extraButtons: [] as Record<string, ReturnType<typeof vi.fn>>[],
  passwordComponents: [] as Record<string, ReturnType<typeof vi.fn>>[]
}));

interface MockPluginConstructorParams {
  app?: unknown;
}

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin-settings-tab-base', () => ({
  PluginSettingsTabBase: class MockPluginSettingsTabBase {
    public app: unknown;
    public bind = vi.fn();
    public containerEl = document.createElement('div');
    public plugin: Plugin;
    public constructor(plugin: Plugin, _params?: MockPluginConstructorParams) {
      this.plugin = plugin;
      this.app = plugin.app;
    }

    public display(): void {
      this.containerEl.empty();
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/setting-group-ex', () => ({
  SettingGroupEx: vi.fn(function settingGroupExMock(this: Record<string, ReturnType<typeof vi.fn>>) {
    this['addSettingEx'] = vi.fn(
      function addSettingExMock(this: Record<string, ReturnType<typeof vi.fn>>, cb: (s: Record<string, ReturnType<typeof vi.fn>>) => void) {
        const s: Record<string, ReturnType<typeof vi.fn>> = {};
        s['addButton'] = vi.fn((buttonCb: (b: Record<string, ReturnType<typeof vi.fn>>) => void) => {
          const b: Record<string, ReturnType<typeof vi.fn>> = {};
          b['setButtonText'] = vi.fn(() => b);
          b['setCta'] = vi.fn(() => b);
          b['setDisabled'] = vi.fn(() => b);
          b['onClick'] = vi.fn(() => b);
          b['setWarning'] = vi.fn(() => b);
          captured.buttons.push(b);
          buttonCb(b);
          return s;
        });
        s['addEmail'] = vi.fn((emailCb: (c: Record<string, ReturnType<typeof vi.fn>>) => void) => {
          const c: Record<string, ReturnType<typeof vi.fn>> = {};
          c['setDisabled'] = vi.fn(() => c);
          c['setValue'] = vi.fn(() => c);
          c['onChange'] = vi.fn(() => c);
          captured.emailComponents.push(c);
          emailCb(c);
          return s;
        });
        s['addExtraButton'] = vi.fn((extraCb: (c: Record<string, ReturnType<typeof vi.fn>>) => void) => {
          const c: Record<string, ReturnType<typeof vi.fn>> = {};
          c['setTooltip'] = vi.fn(() => c);
          c['setIcon'] = vi.fn(() => c);
          c['onClick'] = vi.fn(() => c);
          captured.extraButtons.push(c);
          extraCb(c);
          return s;
        });
        s['addPassword'] = vi.fn((passCb: (c: Record<string, ReturnType<typeof vi.fn>>) => void) => {
          const c: Record<string, ReturnType<typeof vi.fn>> = {};
          c['setDisabled'] = vi.fn(() => c);
          c['setValue'] = vi.fn(() => c);
          c['onChange'] = vi.fn(() => c);
          captured.passwordComponents.push(c);
          passCb(c);
          return s;
        });
        s['addNumber'] = vi.fn((numCb: (c: Record<string, ReturnType<typeof vi.fn>>) => void) => {
          const c: Record<string, ReturnType<typeof vi.fn>> = {};
          c['setMin'] = vi.fn(() => c);
          numCb(c);
          return s;
        });
        s['addToggle'] = vi.fn((toggleCb: (c: unknown) => void) => {
          toggleCb({});
          return s;
        });
        s['addCodeHighlighter'] = vi.fn((chCb: (c: Record<string, ReturnType<typeof vi.fn>>) => void) => {
          const ch: Record<string, ReturnType<typeof vi.fn>> = {};
          ch['setLanguage'] = vi.fn(() => ch);
          chCb(ch);
          return s;
        });
        s['setName'] = vi.fn(() => s);
        s['setDesc'] = vi.fn(() => s);
        s['setClass'] = vi.fn(() => s);
        cb(s);
        return this;
      }
    );
    this['setHeading'] = vi.fn(() => this);
    return this;
  })
}));

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    Notice: vi.fn()
  };
});

vi.mock('obsidian-dev-utils/async', () => ({
  convertAsyncToSync: vi.fn((fn: (...args: unknown[]) => unknown) => fn)
}));

vi.mock('obsidian-dev-utils/obsidian/modals/confirm', () => ({
  confirm: vi.fn(async () => true)
}));

const MockSettingGroupEx = vi.mocked(SettingGroupEx);

interface MockPluginOverrides {
  emailAddress?: string;
  emailPasswordSecretKey?: string;
  settingsManagerEditAndSave?: (cb: (s: PluginSettings) => void) => Promise<void>;
}

function createMockMailTmManager(): MailTmManager {
  return strictProxy<MailTmManager>({
    registerRandomEmailAddress: vi.fn(),
    unregisterEmailAddress: vi.fn()
  });
}

function createMockPlugin(overrides?: MockPluginOverrides): Plugin {
  return strictProxy<Plugin>({
    app: {
      secretStorage: {
        getSecret: vi.fn(() => 'test-password'),
        setSecret: vi.fn()
      }
    },
    manifest: {
      id: 'email-to-vault'
    },
    settings: {
      emailAddress: overrides?.emailAddress ?? '',
      emailPasswordSecretKey: overrides?.emailPasswordSecretKey ?? 'test-key'
    },
    settingsManager: {
      editAndSave: overrides?.settingsManagerEditAndSave ?? vi.fn()
    }
  });
}

describe('PluginSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.buttons.length = 0;
    captured.emailComponents.length = 0;
    captured.extraButtons.length = 0;
    captured.passwordComponents.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

    it('should call registerRandomEmailAddress on button click when no address exists', async () => {
      const manager = createMockMailTmManager();
      const tab = new PluginSettingsTab(createMockPlugin(), manager);
      tab.display();
      vi.spyOn(tab, 'display').mockImplementation(noop);

      const button = ensureNonNullable(captured.buttons[0]);
      const onClickMock = ensureNonNullable(button['onClick']);
      const onClick = ensureNonNullable(onClickMock.mock.calls[0])[0] as () => Promise<void>;
      await onClick();

      expect(manager.registerRandomEmailAddress).toHaveBeenCalledOnce();
    });

    it('should refresh display after registering new email address', async () => {
      const tab = new PluginSettingsTab(createMockPlugin(), createMockMailTmManager());
      tab.display();
      const displaySpy = vi.spyOn(tab, 'display').mockImplementation(noop);

      const button = ensureNonNullable(captured.buttons[0]);
      const onClickMock = ensureNonNullable(button['onClick']);
      const onClick = ensureNonNullable(onClickMock.mock.calls[0])[0] as () => Promise<void>;
      await onClick();

      expect(displaySpy).toHaveBeenCalledOnce();
    });

    it('should unregister email when user confirms', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      const manager = createMockMailTmManager();
      const tab = new PluginSettingsTab(createMockPlugin({ emailAddress: 'old@mail.tm' }), manager);
      tab.display();
      vi.spyOn(tab, 'display').mockImplementation(noop);

      const button = ensureNonNullable(captured.buttons[0]);
      const onClickMock = ensureNonNullable(button['onClick']);
      const onClick = ensureNonNullable(onClickMock.mock.calls[0])[0] as () => Promise<void>;
      await onClick();

      expect(manager.unregisterEmailAddress).toHaveBeenCalledOnce();
    });

    it('should not unregister when user cancels', async () => {
      vi.mocked(confirm).mockResolvedValue(false);
      const manager = createMockMailTmManager();
      const tab = new PluginSettingsTab(createMockPlugin({ emailAddress: 'old@mail.tm' }), manager);
      tab.display();
      vi.spyOn(tab, 'display').mockImplementation(noop);

      const button = ensureNonNullable(captured.buttons[0]);
      const onClickMock = ensureNonNullable(button['onClick']);
      const onClick = ensureNonNullable(onClickMock.mock.calls[0])[0] as () => Promise<void>;
      await onClick();

      expect(manager.unregisterEmailAddress).not.toHaveBeenCalled();
    });

    it('should copy email address to clipboard', async () => {
      const writeTextFn = vi.fn(async () => Promise.resolve());
      vi.stubGlobal('navigator', { clipboard: { writeText: writeTextFn } });
      const tab = new PluginSettingsTab(createMockPlugin({ emailAddress: 'test@mail.tm' }), createMockMailTmManager());
      tab.display();

      const emailCopyButton = ensureNonNullable(captured.extraButtons[0]);
      const onClickMock = ensureNonNullable(emailCopyButton['onClick']);
      const onClick = ensureNonNullable(onClickMock.mock.calls[0])[0] as () => Promise<void>;
      await onClick();

      expect(writeTextFn).toHaveBeenCalledWith('test@mail.tm');
    });

    it('should copy password to clipboard', async () => {
      const writeTextFn = vi.fn(async () => Promise.resolve());
      vi.stubGlobal('navigator', { clipboard: { writeText: writeTextFn } });
      const tab = new PluginSettingsTab(createMockPlugin({ emailAddress: 'test@mail.tm' }), createMockMailTmManager());
      tab.display();

      const passwordCopyButton = ensureNonNullable(captured.extraButtons[1]);
      const onClickMock = ensureNonNullable(passwordCopyButton['onClick']);
      const onClick = ensureNonNullable(onClickMock.mock.calls[0])[0] as () => Promise<void>;
      await onClick();

      expect(writeTextFn).toHaveBeenCalledWith('test-password');
    });

    it('should save password to secret storage on manual entry when unregistered', async () => {
      const plugin = createMockPlugin();
      const tab = new PluginSettingsTab(plugin, createMockMailTmManager());
      tab.display();

      const passwordComponent = ensureNonNullable(captured.passwordComponents[0]);
      const onChangeMock = ensureNonNullable(passwordComponent['onChange']);
      const onChange = ensureNonNullable(onChangeMock.mock.calls[0])[0] as (value: string) => Promise<void>;
      await onChange('new-password');

      expect(plugin.app.secretStorage.setSecret).toHaveBeenCalledWith('test-key', 'new-password');
    });

    it('should create password secret key if missing on manual entry', async () => {
      const plugin = createMockPlugin({
        emailPasswordSecretKey: ''
      });
      const editAndSaveFn = vi.fn(async (cb: (s: PluginSettings) => void): Promise<void> => {
        cb(plugin.settings);
      });
      vi.mocked(plugin.settingsManager.editAndSave).mockImplementation(editAndSaveFn);
      const tab = new PluginSettingsTab(plugin, createMockMailTmManager());
      tab.display();

      const passwordComponent = ensureNonNullable(captured.passwordComponents[0]);
      const onChangeMock = ensureNonNullable(passwordComponent['onChange']);
      const onChange = ensureNonNullable(onChangeMock.mock.calls[0])[0] as (value: string) => Promise<void>;
      await onChange('manual-password');

      expect(editAndSaveFn).toHaveBeenCalledOnce();
      expect(plugin.settings.emailPasswordSecretKey).toBe('email-to-vault-password');
    });

    it('should not recreate password secret key if already set', async () => {
      const editAndSaveFn = vi.fn();
      const plugin = createMockPlugin({
        settingsManagerEditAndSave: editAndSaveFn
      });
      const tab = new PluginSettingsTab(plugin, createMockMailTmManager());
      tab.display();

      const passwordComponent = ensureNonNullable(captured.passwordComponents[0]);
      const onChangeMock = ensureNonNullable(passwordComponent['onChange']);
      const onChange = ensureNonNullable(onChangeMock.mock.calls[0])[0] as (value: string) => Promise<void>;
      await onChange('another-password');

      expect(editAndSaveFn).not.toHaveBeenCalled();
    });

    it('should show notice when no password found for copy', async () => {
      const writeTextFn = vi.fn(async () => Promise.resolve());
      vi.stubGlobal('navigator', { clipboard: { writeText: writeTextFn } });
      const plugin = createMockPlugin({ emailAddress: 'test@mail.tm' });
      vi.mocked(plugin.app.secretStorage.getSecret).mockReturnValue(null);
      const tab = new PluginSettingsTab(plugin, createMockMailTmManager());
      tab.display();

      const passwordCopyButton = ensureNonNullable(captured.extraButtons[1]);
      const onClickMock = ensureNonNullable(passwordCopyButton['onClick']);
      const onClick = ensureNonNullable(onClickMock.mock.calls[0])[0] as () => Promise<void>;
      await onClick();

      expect(writeTextFn).not.toHaveBeenCalled();
    });
  });
});
