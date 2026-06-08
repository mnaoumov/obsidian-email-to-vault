import {
  noop,
  noopAsync
} from 'obsidian-dev-utils/function';
import { confirm } from 'obsidian-dev-utils/obsidian/modals/confirm';
import { SettingGroupEx } from 'obsidian-dev-utils/obsidian/setting-group-ex';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  ensureGenericObject,
  ensureNonNullable
} from 'obsidian-dev-utils/type-guards';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type { PluginSettings } from './plugin-settings.ts';
import type { Plugin } from './plugin.ts';
import type { EmailProviderManagerComponent } from './providers/email-provider-manager.ts';
import type { MailTmProviderComponent } from './providers/mail-tm/mail-tm-provider.ts';

import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { EmailProviderType } from './providers/email-provider-type.ts';

const captured = vi.hoisted(() => ({
  buttons: [] as Record<string, ReturnType<typeof vi.fn>>[],
  dropdowns: [] as Record<string, ReturnType<typeof vi.fn>>[],
  emailComponents: [] as Record<string, ReturnType<typeof vi.fn>>[],
  extraButtons: [] as Record<string, ReturnType<typeof vi.fn>>[],
  passwordComponents: [] as Record<string, ReturnType<typeof vi.fn>>[]
}));

interface MockPluginSettingsTabBaseParams {
  readonly plugin: Plugin;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin-settings-tab', () => ({
  PluginSettingsTabBase: class MockPluginSettingsTabBase {
    public app: unknown;
    public bind = vi.fn();
    public containerEl = activeDocument.createElement('div');
    public plugin: Plugin;
    public pluginSettingsComponent: PluginSettingsComponent;
    public constructor(params: MockPluginSettingsTabBaseParams) {
      this.plugin = params.plugin;
      this.pluginSettingsComponent = params.pluginSettingsComponent;
      this.app = params.plugin.app;
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
        s['addDropdown'] = vi.fn((dropdownCb: (d: Record<string, ReturnType<typeof vi.fn>>) => void) => {
          const d: Record<string, ReturnType<typeof vi.fn>> = {};
          d['addOption'] = vi.fn(() => d);
          d['addOptions'] = vi.fn(() => d);
          d['setValue'] = vi.fn(() => d);
          d['onChange'] = vi.fn(() => d);
          captured.dropdowns.push(d);
          dropdownCb(d);
          return s;
        });
        s['addText'] = vi.fn((textCb: (c: Record<string, ReturnType<typeof vi.fn>>) => void) => {
          const c: Record<string, ReturnType<typeof vi.fn>> = {};
          c['setValue'] = vi.fn(() => c);
          c['onChange'] = vi.fn(() => c);
          textCb(c);
          return s;
        });
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
  confirm: vi.fn(async () => {
    await noopAsync();
    return true;
  })
}));

const MockSettingGroupEx = vi.mocked(SettingGroupEx);

interface MockPluginSettingsComponentOverrides {
  editAndSave?(cb: (s: PluginSettings) => void): Promise<void>;
  emailAddress?: string;
  emailPasswordSecretKey?: string;
  emailProviderType?: EmailProviderType;
}

function createMockEmailProviderManager(mailTmProvider?: MailTmProviderComponent): EmailProviderManagerComponent {
  const provider = mailTmProvider ?? createMockMailTmProvider();
  return strictProxy<EmailProviderManagerComponent>({
    getMailTmProvider: vi.fn(() => provider)
  });
}

function createMockMailTmProvider(): MailTmProviderComponent {
  return strictProxy<MailTmProviderComponent>({
    registerRandomEmailAddress: vi.fn(),
    unregisterEmailAddress: vi.fn()
  });
}

function createMockPlugin(): Plugin {
  return strictProxy<Plugin>({
    app: {
      secretStorage: {
        getSecret: vi.fn(() => 'test-password'),
        setSecret: vi.fn()
      }
    }
  });
}

function createMockPluginSettingsComponent(overrides?: MockPluginSettingsComponentOverrides): PluginSettingsComponent {
  return strictProxy<PluginSettingsComponent>({
    editAndSave: overrides?.editAndSave ?? vi.fn(),
    settings: {
      emailAddress: overrides?.emailAddress ?? '',
      emailPasswordSecretKey: overrides?.emailPasswordSecretKey ?? 'test-key',
      emailProviderType: overrides?.emailProviderType ?? EmailProviderType.MailTm
    }
  });
}

describe('PluginSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.buttons.length = 0;
    captured.dropdowns.length = 0;
    captured.emailComponents.length = 0;
    captured.extraButtons.length = 0;
    captured.passwordComponents.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('display', () => {
    it('should create three setting groups with correct headings when Mail.tm is selected', () => {
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(),
        plugin: createMockPlugin(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent: createMockPluginSettingsComponent()
      });

      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();

      expect(MockSettingGroupEx).toHaveBeenCalledTimes(3);
      const group1 = ensureNonNullable(MockSettingGroupEx.mock.instances[0]);
      const group2 = ensureNonNullable(MockSettingGroupEx.mock.instances[1]);
      const group3 = ensureNonNullable(MockSettingGroupEx.mock.instances[2]);
      expect(group1.setHeading).toHaveBeenCalledWith('Provider');
      expect(group2.setHeading).toHaveBeenCalledWith('Mail.tm');
      expect(group3.setHeading).toHaveBeenCalledWith('Main');
    });

    it('should create three setting groups with IMAP heading when IMAP is selected', () => {
      const manager = createMockEmailProviderManager();
      vi.mocked(manager.getMailTmProvider).mockReturnValue(null);
      const tab = new PluginSettingsTab({
        emailProviderManager: manager,
        plugin: createMockPlugin(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent: createMockPluginSettingsComponent({ emailProviderType: EmailProviderType.Imap })
      });

      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();

      expect(MockSettingGroupEx).toHaveBeenCalledTimes(3);
      const group1 = ensureNonNullable(MockSettingGroupEx.mock.instances[0]);
      const group2 = ensureNonNullable(MockSettingGroupEx.mock.instances[1]);
      const group3 = ensureNonNullable(MockSettingGroupEx.mock.instances[2]);
      expect(group1.setHeading).toHaveBeenCalledWith('Provider');
      expect(group2.setHeading).toHaveBeenCalledWith('IMAP');
      expect(group3.setHeading).toHaveBeenCalledWith('Main');
    });

    it('should skip Mail.tm section when provider is MailTm but getMailTmProvider returns null', () => {
      const manager = createMockEmailProviderManager();
      vi.mocked(manager.getMailTmProvider).mockReturnValue(null);
      const tab = new PluginSettingsTab({
        emailProviderManager: manager,
        plugin: createMockPlugin(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent: createMockPluginSettingsComponent({ emailProviderType: EmailProviderType.MailTm })
      });

      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();

      expect(MockSettingGroupEx).toHaveBeenCalledTimes(2);
    });

    it('should bind provider dropdown with onChanged that re-renders display', () => {
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(),
        plugin: createMockPlugin(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent: createMockPluginSettingsComponent()
      });
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();

      const bindCall = ensureNonNullable(vi.mocked(tab.bind).mock.calls.find((call) => call[1] === 'emailProviderType'));
      const options = ensureGenericObject<object>(bindCall[2]);
      const onChanged = ensureNonNullable(options['onChanged']) as () => void;
      expect(onChanged).toBeTypeOf('function');

      const displaySpy = vi.spyOn(tab, 'display').mockImplementation(noop);
      onChanged();

      expect(displaySpy).toHaveBeenCalledOnce();
    });

    it('should not set a separate onChange on provider dropdown that overwrites bind', () => {
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(),
        plugin: createMockPlugin(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent: createMockPluginSettingsComponent()
      });
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();

      const dropdown = ensureNonNullable(captured.dropdowns[0]);
      expect(dropdown['onChange']).not.toHaveBeenCalled();
    });

    it('should pass containerEl to SettingGroupEx', () => {
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(),
        plugin: createMockPlugin(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent: createMockPluginSettingsComponent()
      });

      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();

      expect(MockSettingGroupEx).toHaveBeenNthCalledWith(1, tab.containerEl);
      expect(MockSettingGroupEx).toHaveBeenNthCalledWith(2, tab.containerEl);
      expect(MockSettingGroupEx).toHaveBeenNthCalledWith(3, tab.containerEl);
    });

    it('should render provider dropdown with all options', () => {
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(),
        plugin: createMockPlugin(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent: createMockPluginSettingsComponent()
      });

      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();

      const dropdown = ensureNonNullable(captured.dropdowns[0]);
      expect(dropdown['addOption']).toHaveBeenCalledWith('mail-tm', 'Mail.tm');
      expect(dropdown['addOption']).toHaveBeenCalledWith('imap', 'IMAP');
    });

    it('should call registerRandomEmailAddress on button click when no address exists', async () => {
      const mailTmProvider = createMockMailTmProvider();
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(mailTmProvider),
        plugin: createMockPlugin(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent: createMockPluginSettingsComponent()
      });
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();
      vi.spyOn(tab, 'display').mockImplementation(noop);

      const button = ensureNonNullable(captured.buttons[0]);
      const onClickMock = ensureNonNullable(button['onClick']);
      const onClick = ensureNonNullable(onClickMock.mock.calls[0])[0] as () => Promise<void>;
      await onClick();

      expect(mailTmProvider.registerRandomEmailAddress).toHaveBeenCalledOnce();
    });

    it('should refresh display after registering new email address', async () => {
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(),
        plugin: createMockPlugin(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent: createMockPluginSettingsComponent()
      });
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
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
      const mailTmProvider = createMockMailTmProvider();
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(mailTmProvider),
        plugin: createMockPlugin(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent: createMockPluginSettingsComponent({ emailAddress: 'old@mail.tm' })
      });
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();
      vi.spyOn(tab, 'display').mockImplementation(noop);

      const button = ensureNonNullable(captured.buttons[0]);
      const onClickMock = ensureNonNullable(button['onClick']);
      const onClick = ensureNonNullable(onClickMock.mock.calls[0])[0] as () => Promise<void>;
      await onClick();

      expect(mailTmProvider.unregisterEmailAddress).toHaveBeenCalledOnce();
    });

    it('should not unregister when user cancels', async () => {
      vi.mocked(confirm).mockResolvedValue(false);
      const mailTmProvider = createMockMailTmProvider();
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(mailTmProvider),
        plugin: createMockPlugin(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent: createMockPluginSettingsComponent({ emailAddress: 'old@mail.tm' })
      });
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();
      vi.spyOn(tab, 'display').mockImplementation(noop);

      const button = ensureNonNullable(captured.buttons[0]);
      const onClickMock = ensureNonNullable(button['onClick']);
      const onClick = ensureNonNullable(onClickMock.mock.calls[0])[0] as () => Promise<void>;
      await onClick();

      expect(mailTmProvider.unregisterEmailAddress).not.toHaveBeenCalled();
    });

    it('should copy email address to clipboard', async () => {
      const writeTextFn = vi.fn(async () => noopAsync());
      vi.stubGlobal('navigator', { clipboard: { writeText: writeTextFn } });
      const pluginSettingsComponent = createMockPluginSettingsComponent({ emailAddress: 'test@mail.tm' });
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(),
        plugin: createMockPlugin(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();

      const emailCopyButton = ensureNonNullable(captured.extraButtons[0]);
      const onClickMock = ensureNonNullable(emailCopyButton['onClick']);
      const onClick = ensureNonNullable(onClickMock.mock.calls[0])[0] as () => Promise<void>;
      await onClick();

      expect(writeTextFn).toHaveBeenCalledWith('test@mail.tm');
    });

    it('should copy password to clipboard', async () => {
      const writeTextFn = vi.fn(async () => noopAsync());
      vi.stubGlobal('navigator', { clipboard: { writeText: writeTextFn } });
      const pluginSettingsComponent = createMockPluginSettingsComponent({ emailAddress: 'test@mail.tm' });
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(),
        plugin: createMockPlugin(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();

      const passwordCopyButton = ensureNonNullable(captured.extraButtons[1]);
      const onClickMock = ensureNonNullable(passwordCopyButton['onClick']);
      const onClick = ensureNonNullable(onClickMock.mock.calls[0])[0] as () => Promise<void>;
      await onClick();

      expect(writeTextFn).toHaveBeenCalledWith('test-password');
    });

    it('should save password to secret storage on manual entry when unregistered', async () => {
      const plugin = createMockPlugin();
      const pluginSettingsComponent = createMockPluginSettingsComponent();
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(),
        plugin,
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();

      const passwordComponent = ensureNonNullable(captured.passwordComponents[0]);
      const onChangeMock = ensureNonNullable(passwordComponent['onChange']);
      const onChange = ensureNonNullable(onChangeMock.mock.calls[0])[0] as (value: string) => Promise<void>;
      await onChange('new-password');

      expect(plugin.app.secretStorage.setSecret).toHaveBeenCalledWith('test-key', 'new-password');
    });

    it('should create password secret key if missing on manual entry', async () => {
      const plugin = createMockPlugin();
      const settings = {
        emailAddress: '',
        emailPasswordSecretKey: '',
        emailProviderType: EmailProviderType.MailTm
      } as PluginSettings;
      const editAndSaveFn = vi.fn(async (cb: (s: PluginSettings) => void): Promise<void> => {
        await noopAsync();
        cb(settings);
      });
      const pluginSettingsComponent = createMockPluginSettingsComponent({
        editAndSave: editAndSaveFn,
        emailPasswordSecretKey: ''
      });
      // Update settings reference to match the component's settings
      ensureGenericObject<object>(pluginSettingsComponent)['settings'] = settings;
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(),
        plugin,
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();

      const passwordComponent = ensureNonNullable(captured.passwordComponents[0]);
      const onChangeMock = ensureNonNullable(passwordComponent['onChange']);
      const onChange = ensureNonNullable(onChangeMock.mock.calls[0])[0] as (value: string) => Promise<void>;
      await onChange('manual-password');

      expect(editAndSaveFn).toHaveBeenCalledOnce();
      expect(settings.emailPasswordSecretKey).toBe('email-to-vault-password');
    });

    it('should not recreate password secret key if already set', async () => {
      const editAndSaveFn = vi.fn();
      const pluginSettingsComponent = createMockPluginSettingsComponent({
        editAndSave: editAndSaveFn
      });
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(),
        plugin: createMockPlugin(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();

      const passwordComponent = ensureNonNullable(captured.passwordComponents[0]);
      const onChangeMock = ensureNonNullable(passwordComponent['onChange']);
      const onChange = ensureNonNullable(onChangeMock.mock.calls[0])[0] as (value: string) => Promise<void>;
      await onChange('another-password');

      expect(editAndSaveFn).not.toHaveBeenCalled();
    });

    it('should show notice when no password found for copy', async () => {
      const writeTextFn = vi.fn(async () => noopAsync());
      vi.stubGlobal('navigator', { clipboard: { writeText: writeTextFn } });
      const plugin = createMockPlugin();
      vi.mocked(plugin.app.secretStorage.getSecret).mockReturnValue(null);
      const pluginSettingsComponent = createMockPluginSettingsComponent({ emailAddress: 'test@mail.tm' });
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(),
        plugin,
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();

      const passwordCopyButton = ensureNonNullable(captured.extraButtons[1]);
      const onClickMock = ensureNonNullable(passwordCopyButton['onClick']);
      const onClick = ensureNonNullable(onClickMock.mock.calls[0])[0] as () => Promise<void>;
      await onClick();

      expect(writeTextFn).not.toHaveBeenCalled();
    });

    it('should show empty password when secret storage returns null for IMAP', () => {
      const plugin = createMockPlugin();
      vi.mocked(plugin.app.secretStorage.getSecret).mockReturnValue(null);
      const pluginSettingsComponent = createMockPluginSettingsComponent({ emailProviderType: EmailProviderType.Imap });
      const manager = createMockEmailProviderManager();
      vi.mocked(manager.getMailTmProvider).mockReturnValue(null);
      const tab = new PluginSettingsTab({ emailProviderManager: manager, plugin, pluginId: 'email-to-vault', pluginSettingsComponent });
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();

      const passwordComponent = ensureNonNullable(captured.passwordComponents[0]);
      const setValueMock = ensureNonNullable(passwordComponent['setValue']);
      expect(setValueMock).toHaveBeenCalledWith('');
    });

    it('should save IMAP password to secret storage on entry', async () => {
      const plugin = createMockPlugin();
      const pluginSettingsComponent = createMockPluginSettingsComponent({ emailProviderType: EmailProviderType.Imap });
      const manager = createMockEmailProviderManager();
      vi.mocked(manager.getMailTmProvider).mockReturnValue(null);
      const tab = new PluginSettingsTab({
        emailProviderManager: manager,
        plugin,
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- display() is the entry point for PluginSettingsTabBase; calling it in tests is intentional.
      tab.display();

      const passwordComponent = ensureNonNullable(captured.passwordComponents[0]);
      const onChangeMock = ensureNonNullable(passwordComponent['onChange']);
      const onChange = ensureNonNullable(onChangeMock.mock.calls[0])[0] as (value: string) => Promise<void>;
      await onChange('imap-password');

      expect(plugin.app.secretStorage.setSecret).toHaveBeenCalledWith('test-key', 'imap-password');
    });
  });
});
