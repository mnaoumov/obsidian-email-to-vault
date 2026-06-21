import type { AsyncEventRef } from 'obsidian-dev-utils/async-events';
import type { MockInstance } from 'vitest';

import {
  noop,
  noopAsync
} from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { confirm } from 'obsidian-dev-utils/obsidian/modals/confirm';
import { PasswordComponent } from 'obsidian-dev-utils/obsidian/setting-components/password-component';
import { SettingGroupEx } from 'obsidian-dev-utils/obsidian/setting-group-ex';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  ensureGenericObject,
  ensureNonNullable
} from 'obsidian-dev-utils/type-guards';
import {
  ButtonComponent,
  DropdownComponent,
  ExtraButtonComponent
} from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type { Plugin } from './plugin.ts';
import type { EmailProviderManagerComponent } from './providers/email-provider-manager.ts';
import type { MailTmProviderComponent } from './providers/mail-tm/mail-tm-provider.ts';

import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { PluginSettings } from './plugin-settings.ts';
import { EmailProviderType } from './providers/email-provider-type.ts';

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    Notice: vi.fn()
  };
});

// The setting `onClick`/`onChange` handlers are wrapped in `convertAsyncToSync` (fire-and-forget). Stub it
// To identity so the captured handlers are the raw async functions and the test can `await` them — the
// Sanctioned exception for making fire-and-forget async awaitable in a unit test.
vi.mock('obsidian-dev-utils/async', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/async')>(),
  convertAsyncToSync: vi.fn((fn: (...args: unknown[]) => unknown) => fn)
}));

vi.mock('obsidian-dev-utils/obsidian/modals/confirm', () => ({
  confirm: vi.fn(async () => {
    await noopAsync();
    return true;
  })
}));

interface MockPluginSettingsComponentOverrides {
  editAndSave?: PluginSettingsComponent['editAndSave'];
  emailAddress?: string;
  emailPasswordSecretKey?: string;
  emailProviderType?: EmailProviderType;
}

interface ProviderDropdownBindOptions {
  onChanged?(newValue: EmailProviderType, oldValue: EmailProviderType): unknown;
}

// Real components are rendered by the real `SettingGroupEx`; these prototype spies capture the real
// Component instances/handlers as they are created so the tests can drive them.
//
// `bind` is the one real base method that cannot run here: it duck-types each component via property
// Access (e.g. `component.setPlaceholderValue`), which the test-mocks strict proxy rejects for
// Non-text components (dropdown/toggle). It is neutralized to a no-op (returning the component) — the
// Real `PluginSettingsTabBase`/`SettingGroupEx`/components are otherwise used unmocked. The tab's own
// Binding intent is asserted via the recorded `bind` calls instead.
let bindSpy: MockInstance<PluginSettingsTab['bind']>;
let setHeadingSpy: MockInstance<SettingGroupEx['setHeading']>;
let buttonOnClickSpy: MockInstance<ButtonComponent['onClick']>;
let extraButtonOnClickSpy: MockInstance<ExtraButtonComponent['onClick']>;
let dropdownAddOptionSpy: MockInstance<DropdownComponent['addOption']>;
let dropdownOnChangeSpy: MockInstance<DropdownComponent['onChange']>;
let passwordOnChangeSpy: MockInstance<PasswordComponent['onChange']>;
let passwordSetValueSpy: MockInstance<PasswordComponent['setValue']>;

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
    },
    manifest: { id: 'email-to-vault' }
  });
}

function createMockPluginSettingsComponent(overrides?: MockPluginSettingsComponentOverrides): PluginSettingsComponent {
  const settings = new PluginSettings();
  settings.emailProviderType = overrides?.emailProviderType ?? EmailProviderType.MailTm;
  settings.emailAddress = overrides?.emailAddress ?? '';
  settings.emailPasswordSecretKey = overrides?.emailPasswordSecretKey ?? 'test-key';

  return strictProxy<PluginSettingsComponent>({
    defaultSettings: new PluginSettings(),
    editAndSave: overrides?.editAndSave ?? vi.fn(),
    on: vi.fn(() =>
      strictProxy<AsyncEventRef>({
        asyncEventSource: { offref: vi.fn() }
      })
    ),
    saveToFile: vi.fn(async () => noopAsync()),
    setProperty: vi.fn(async () => {
      await noopAsync();
      return '';
    }),
    settings,
    settingsState: {
      effectiveValues: settings,
      inputValues: settings,
      validationMessages: {}
    }
  });
}

function createTab(overrides?: MockPluginSettingsComponentOverrides, mailTmProvider?: MailTmProviderComponent): PluginSettingsTab {
  return new PluginSettingsTab({
    emailProviderManager: createMockEmailProviderManager(mailTmProvider),
    plugin: createMockPlugin(),
    pluginId: 'email-to-vault',
    pluginSettingsComponent: createMockPluginSettingsComponent(overrides)
  });
}

describe('PluginSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bindSpy = vi.spyOn(PluginSettingsTab.prototype, 'bind').mockImplementation((valueComponent) => valueComponent);
    setHeadingSpy = vi.spyOn(SettingGroupEx.prototype, 'setHeading');
    buttonOnClickSpy = vi.spyOn(ButtonComponent.prototype, 'onClick');
    extraButtonOnClickSpy = vi.spyOn(ExtraButtonComponent.prototype, 'onClick');
    dropdownAddOptionSpy = vi.spyOn(DropdownComponent.prototype, 'addOption');
    dropdownOnChangeSpy = vi.spyOn(DropdownComponent.prototype, 'onChange');
    passwordOnChangeSpy = vi.spyOn(PasswordComponent.prototype, 'onChange');
    passwordSetValueSpy = vi.spyOn(PasswordComponent.prototype, 'setValue');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('display', () => {
    it('should create three setting groups with correct headings when Mail.tm is selected', () => {
      const tab = createTab();

      tab.displayLegacy();

      expect(setHeadingSpy.mock.calls.map((call) => call[0])).toEqual(['Provider', 'Mail.tm', 'Main']);
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

      tab.displayLegacy();

      expect(setHeadingSpy.mock.calls.map((call) => call[0])).toEqual(['Provider', 'IMAP', 'Main']);
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

      tab.displayLegacy();

      expect(setHeadingSpy.mock.calls.map((call) => call[0])).toEqual(['Provider', 'Main']);
    });

    it('should bind provider dropdown with onChanged that re-renders display', () => {
      const tab = createTab();
      tab.displayLegacy();

      const bindCall = ensureNonNullable(bindSpy.mock.calls.find((call) => call[1] === 'emailProviderType'));
      const options = ensureGenericObject<ProviderDropdownBindOptions>(bindCall[2]);
      const onChanged = ensureNonNullable(options.onChanged);
      expect(onChanged).toBeTypeOf('function');

      const displaySpy = vi.spyOn(tab, 'displayLegacy').mockImplementation(noop);
      onChanged(EmailProviderType.Imap, EmailProviderType.MailTm);

      expect(displaySpy).toHaveBeenCalledOnce();
    });

    it('should not set a separate onChange on provider dropdown that overwrites bind', () => {
      const tab = createTab();

      tab.displayLegacy();

      // The source must delegate dropdown change handling to `bind` (via its `onChanged` option),
      // Not register its own `onChange` that would overwrite the binding.
      expect(dropdownOnChangeSpy).not.toHaveBeenCalled();
    });

    it('should render setting groups under the tab containerEl', () => {
      const tab = createTab();

      tab.displayLegacy();

      expect(tab.containerEl.textContent).toContain('Provider');
      expect(tab.containerEl.textContent).toContain('Main');
    });

    it('should render provider dropdown with all options', () => {
      const tab = createTab();

      tab.displayLegacy();

      expect(dropdownAddOptionSpy).toHaveBeenCalledWith('mail-tm', 'Mail.tm');
      expect(dropdownAddOptionSpy).toHaveBeenCalledWith('imap', 'IMAP');
    });

    it('should call registerRandomEmailAddress on button click when no address exists', async () => {
      const mailTmProvider = createMockMailTmProvider();
      const tab = createTab(undefined, mailTmProvider);
      tab.displayLegacy();
      vi.spyOn(tab, 'displayLegacy').mockImplementation(noop);

      const onClick = ensureNonNullable(buttonOnClickSpy.mock.calls[0])[0];
      await onClick(new MouseEvent('click'));

      expect(mailTmProvider.registerRandomEmailAddress).toHaveBeenCalledOnce();
    });

    it('should refresh display after registering new email address', async () => {
      const tab = createTab();
      tab.displayLegacy();
      const displaySpy = vi.spyOn(tab, 'displayLegacy').mockImplementation(noop);

      const onClick = ensureNonNullable(buttonOnClickSpy.mock.calls[0])[0];
      await onClick(new MouseEvent('click'));

      expect(displaySpy).toHaveBeenCalledOnce();
    });

    it('should unregister email when user confirms', async () => {
      vi.mocked(confirm).mockResolvedValue(true);
      const mailTmProvider = createMockMailTmProvider();
      const tab = createTab({ emailAddress: 'old@mail.tm' }, mailTmProvider);
      tab.displayLegacy();
      vi.spyOn(tab, 'displayLegacy').mockImplementation(noop);

      const onClick = ensureNonNullable(buttonOnClickSpy.mock.calls[0])[0];
      await onClick(new MouseEvent('click'));

      expect(mailTmProvider.unregisterEmailAddress).toHaveBeenCalledOnce();
    });

    it('should not unregister when user cancels', async () => {
      vi.mocked(confirm).mockResolvedValue(false);
      const mailTmProvider = createMockMailTmProvider();
      const tab = createTab({ emailAddress: 'old@mail.tm' }, mailTmProvider);
      tab.displayLegacy();
      vi.spyOn(tab, 'displayLegacy').mockImplementation(noop);

      const onClick = ensureNonNullable(buttonOnClickSpy.mock.calls[0])[0];
      await onClick(new MouseEvent('click'));

      expect(mailTmProvider.unregisterEmailAddress).not.toHaveBeenCalled();
    });

    it('should copy email address to clipboard', async () => {
      const writeTextFn = vi.fn(async () => noopAsync());
      vi.stubGlobal('navigator', { clipboard: { writeText: writeTextFn } });
      const tab = createTab({ emailAddress: 'test@mail.tm' });
      tab.displayLegacy();

      const onClick = ensureNonNullable(extraButtonOnClickSpy.mock.calls[0])[0];
      await onClick();

      expect(writeTextFn).toHaveBeenCalledWith('test@mail.tm');
    });

    it('should copy password to clipboard', async () => {
      const writeTextFn = vi.fn(async () => noopAsync());
      vi.stubGlobal('navigator', { clipboard: { writeText: writeTextFn } });
      const tab = createTab({ emailAddress: 'test@mail.tm' });
      tab.displayLegacy();

      const onClick = ensureNonNullable(extraButtonOnClickSpy.mock.calls[1])[0];
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
      tab.displayLegacy();

      const onChange = castTo<(value: string) => Promise<void>>(ensureNonNullable(passwordOnChangeSpy.mock.calls[0])[0]);
      await onChange('new-password');

      expect(plugin.app.secretStorage.setSecret).toHaveBeenCalledWith('test-key', 'new-password');
    });

    it('should create password secret key if missing on manual entry', async () => {
      const editAndSaveFn = vi.fn(async (cb: (settings: PluginSettings) => void): Promise<void> => {
        await noopAsync();
        cb(pluginSettingsComponent.settings);
      });
      const pluginSettingsComponent = createMockPluginSettingsComponent({
        editAndSave: editAndSaveFn,
        emailPasswordSecretKey: ''
      });
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(),
        plugin: createMockPlugin(),
        pluginId: 'email-to-vault',
        pluginSettingsComponent
      });
      tab.displayLegacy();

      const onChange = castTo<(value: string) => Promise<void>>(ensureNonNullable(passwordOnChangeSpy.mock.calls[0])[0]);
      await onChange('manual-password');

      expect(editAndSaveFn).toHaveBeenCalledOnce();
      expect(pluginSettingsComponent.settings.emailPasswordSecretKey).toBe('email-to-vault-password');
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
      tab.displayLegacy();

      const onChange = castTo<(value: string) => Promise<void>>(ensureNonNullable(passwordOnChangeSpy.mock.calls[0])[0]);
      await onChange('another-password');

      expect(editAndSaveFn).not.toHaveBeenCalled();
    });

    it('should show notice when no password found for copy', async () => {
      const writeTextFn = vi.fn(async () => noopAsync());
      vi.stubGlobal('navigator', { clipboard: { writeText: writeTextFn } });
      const plugin = createMockPlugin();
      vi.mocked(plugin.app.secretStorage.getSecret).mockReturnValue(null);
      const tab = new PluginSettingsTab({
        emailProviderManager: createMockEmailProviderManager(),
        plugin,
        pluginId: 'email-to-vault',
        pluginSettingsComponent: createMockPluginSettingsComponent({ emailAddress: 'test@mail.tm' })
      });
      tab.displayLegacy();

      const onClick = ensureNonNullable(extraButtonOnClickSpy.mock.calls[1])[0];
      await onClick();

      expect(writeTextFn).not.toHaveBeenCalled();
    });

    it('should show empty password when secret storage returns null for IMAP', () => {
      const plugin = createMockPlugin();
      vi.mocked(plugin.app.secretStorage.getSecret).mockReturnValue(null);
      const manager = createMockEmailProviderManager();
      vi.mocked(manager.getMailTmProvider).mockReturnValue(null);
      const tab = new PluginSettingsTab({
        emailProviderManager: manager,
        plugin,
        pluginId: 'email-to-vault',
        pluginSettingsComponent: createMockPluginSettingsComponent({ emailProviderType: EmailProviderType.Imap })
      });

      tab.displayLegacy();

      expect(passwordSetValueSpy).toHaveBeenCalledWith('');
    });

    it('should save IMAP password to secret storage on entry', async () => {
      const plugin = createMockPlugin();
      const manager = createMockEmailProviderManager();
      vi.mocked(manager.getMailTmProvider).mockReturnValue(null);
      const tab = new PluginSettingsTab({
        emailProviderManager: manager,
        plugin,
        pluginId: 'email-to-vault',
        pluginSettingsComponent: createMockPluginSettingsComponent({ emailProviderType: EmailProviderType.Imap })
      });
      tab.displayLegacy();

      const onChange = castTo<(value: string) => Promise<void>>(ensureNonNullable(passwordOnChangeSpy.mock.calls[0])[0]);
      await onChange('imap-password');

      expect(plugin.app.secretStorage.setSecret).toHaveBeenCalledWith('test-key', 'imap-password');
    });
  });
});
