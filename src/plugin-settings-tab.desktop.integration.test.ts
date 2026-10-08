import type { Plugin } from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

interface MarkEmailsAsSeenToggleResult {
  readonly afterOff: boolean | null;
  readonly afterOn: boolean | null;
  readonly error: null | string;
  readonly initialEnabled: boolean;
  readonly toggleFound: boolean;
}

const PLUGIN_ID = 'email-to-vault';
const SETTING_NAME = 'Mark emails as seen';

describe('PluginSettingsTab "Mark emails as seen"', () => {
  it('should render the toggle defaulting to on and persist shouldMarkEmailsAsSeen when toggled', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil }, pluginId, settingName }): Promise<MarkEmailsAsSeenToggleResult> {
        const notFound: MarkEmailsAsSeenToggleResult = {
          afterOff: null,
          afterOn: null,
          error: null,
          initialEnabled: false,
          toggleFound: false
        };

        const plugin = app.plugins.getPlugin(pluginId);
        if (!plugin) {
          return { ...notFound, error: 'Plugin not loaded' };
        }

        const settingTab = app.setting.pluginTabs.find((tab) => tab.id === plugin.manifest.id);
        if (!settingTab) {
          return { ...notFound, error: 'Settings tab not found' };
        }

        app.setting.open();
        app.setting.openTabById(plugin.manifest.id);

        const settingItems = [...settingTab.containerEl.querySelectorAll('.setting-item')];
        const item = settingItems.find((el) => el.querySelector('.setting-item-name')?.textContent === settingName);
        const toggle = item?.querySelector<HTMLElement>('.checkbox-container');
        if (!toggle) {
          app.setting.close();
          return { ...notFound, error: 'Toggle not found' };
        }

        const isInitialEnabled = toggle.classList.contains('is-enabled');

        toggle.click();
        await waitUntil({
          message: 'shouldMarkEmailsAsSeen did not persist as false',
          predicate: async () => readMarkEmailsAsSeen(await plugin.loadData()) === false
        });
        const afterOff = readMarkEmailsAsSeen(await plugin.loadData());

        toggle.click();
        await waitUntil({
          message: 'shouldMarkEmailsAsSeen did not persist as true',
          predicate: async () => readMarkEmailsAsSeen(await plugin.loadData()) === true
        });
        const afterOn = readMarkEmailsAsSeen(await plugin.loadData());

        app.setting.close();

        return {
          afterOff,
          afterOn,
          error: null,
          initialEnabled: isInitialEnabled,
          toggleFound: true
        };

        function readMarkEmailsAsSeen(data: unknown): boolean | null {
          if (typeof data === 'object' && data !== null && 'shouldMarkEmailsAsSeen' in data) {
            const value = data.shouldMarkEmailsAsSeen;
            return typeof value === 'boolean' ? value : null;
          }
          return null;
        }
      },
      input: { pluginId: PLUGIN_ID, settingName: SETTING_NAME },
      vaultPath: getTemporaryVault().path
    });

    expect(result.error).toBeNull();
    expect(result.toggleFound).toBe(true);
    expect(result.initialEnabled).toBe(true);
    expect(result.afterOff).toBe(false);
    expect(result.afterOn).toBe(true);
  });
});

interface CredentialSettings {
  emailAddress: string;
  emailPasswordSecretKey: string;
  emailProviderType: string;
}

interface CredentialSettingsComponent {
  readonly editAndSave: (callback: (settings: CredentialSettings) => void) => Promise<void>;
}

interface CredentialTypingResult {
  readonly emailDisabled: boolean | null;
  readonly error: null | string;
  readonly passwordDisabled: boolean | null;
  readonly passwordLength: null | number;
}

interface PluginWithSettingsComponent extends Plugin {
  readonly pluginSettingsComponent: CredentialSettingsComponent;
}

describe('PluginSettingsTab Mail.tm credentials', () => {
  // The first password keystroke saves the secret key, the save rebuilds the tab, and the rebuild used to lock both
  // fields one character into the password (#10).
  it('should keep the address and password editable while they are typed in', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { clickElement, pressKey, waitUntil }, pluginId }): Promise<CredentialTypingResult> {
        const notFound: CredentialTypingResult = { emailDisabled: null, error: null, passwordDisabled: null, passwordLength: null };

        const plugin = app.plugins.getPlugin(pluginId) as null | PluginWithSettingsComponent;
        if (!plugin) {
          return { ...notFound, error: 'Plugin not loaded' };
        }

        await plugin.pluginSettingsComponent.editAndSave((settings) => {
          settings.emailAddress = '';
          settings.emailPasswordSecretKey = '';
          settings.emailProviderType = 'mail-tm';
        });

        app.setting.open();
        app.setting.openTabById(pluginId);

        const containerEl = app.setting.activeTab?.containerEl;
        const emailInput = findInput('.email-address input');
        if (!emailInput) {
          app.setting.close();
          return { ...notFound, error: 'Email input not found' };
        }

        await clickElement({ element: emailInput });
        for (const key of 'me@mail.tm') {
          await pressKey({ key });
        }

        const passwordInput = findInput('input[type="password"]');
        if (!passwordInput) {
          app.setting.close();
          return { ...notFound, error: 'Password input not found' };
        }

        await clickElement({ element: passwordInput });
        await pressKey({ key: 'a' });
        await waitUntil({
          message: 'The first password character never reached the secret storage',
          predicate: () => !!app.secretStorage.getSecret(`${pluginId}-password`)
        });
        // The first keystroke stores the secret key, which is the moment both fields used to lock.
        await pressKey({ key: 'b' });
        const EXPECTED_PASSWORD_LENGTH = 2;
        try {
          await waitUntil({
            message: 'The second password character never reached the secret storage',
            predicate: () => app.secretStorage.getSecret(`${pluginId}-password`)?.length === EXPECTED_PASSWORD_LENGTH
          });
        } catch {
          // Reported through `passwordLength` below, which says what was stored instead.
        }

        const finalEmailInput = findInput('.email-address input');
        const finalPasswordInput = findInput('input[type="password"]');
        const outcome: CredentialTypingResult = {
          emailDisabled: finalEmailInput?.disabled ?? null,
          error: null,
          passwordDisabled: finalPasswordInput?.disabled ?? null,
          passwordLength: app.secretStorage.getSecret(`${pluginId}-password`)?.length ?? null
        };

        app.setting.close();
        await waitUntil({
          message: 'Closing the settings never wrote the password secret key to data.json',
          predicate: async () => {
            const data: unknown = await (app.plugins.getPlugin(pluginId)?.loadData() ?? null);
            return typeof data === 'object' && data !== null && 'emailPasswordSecretKey' in data && data.emailPasswordSecretKey === `${pluginId}-password`;
          }
        });
        await plugin.pluginSettingsComponent.editAndSave((settings) => {
          settings.emailAddress = '';
          settings.emailPasswordSecretKey = '';
        });
        app.secretStorage.setSecret(`${pluginId}-password`, '');

        return outcome;

        function findInput(selector: string): HTMLInputElement | null {
          return containerEl?.querySelector<HTMLInputElement>(selector) ?? null;
        }
      },
      input: { pluginId: PLUGIN_ID },
      vaultPath: getTemporaryVault().path
    });

    expect(result.error).toBeNull();
    expect(result.emailDisabled).toBe(false);
    expect(result.passwordDisabled).toBe(false);
    expect(result.passwordLength).toBe(2);
  });
});
