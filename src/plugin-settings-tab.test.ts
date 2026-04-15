import { noop } from 'obsidian-dev-utils/function';
import { confirm } from 'obsidian-dev-utils/obsidian/modals/confirm';
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

const captured = vi.hoisted(() => ({
  buttons: [] as Record<string, ReturnType<typeof vi.fn>>[]
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
          b['setDisabled'] = vi.fn(() => b);
          b['onClick'] = vi.fn(() => b);
          captured.buttons.push(b);
          buttonCb(b);
          return s;
        });
        s['addEmail'] = vi.fn((emailCb: (c: Record<string, ReturnType<typeof vi.fn>>) => void) => {
          const c: Record<string, ReturnType<typeof vi.fn>> = {};
          c['setDisabled'] = vi.fn(() => c);
          emailCb(c);
          return s;
        });
        s['addExtraButton'] = vi.fn((extraCb: (c: Record<string, ReturnType<typeof vi.fn>>) => void) => {
          const c: Record<string, ReturnType<typeof vi.fn>> = {};
          c['setTooltip'] = vi.fn(() => c);
          c['setIcon'] = vi.fn(() => c);
          c['onClick'] = vi.fn(() => c);
          extraCb(c);
          return s;
        });
        s['addPassword'] = vi.fn((passCb: (c: Record<string, ReturnType<typeof vi.fn>>) => void) => {
          const c: Record<string, ReturnType<typeof vi.fn>> = {};
          c['setDisabled'] = vi.fn(() => c);
          c['setValue'] = vi.fn(() => c);
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
        getSecret: vi.fn(() => 'test-password')
      }
    },
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

    it('should unregister old address and register new one when email exists and user confirms', async () => {
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
      expect(manager.registerRandomEmailAddress).toHaveBeenCalledOnce();
    });

    it('should not register when email exists and user cancels', async () => {
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
      expect(manager.registerRandomEmailAddress).not.toHaveBeenCalled();
    });
  });
});
