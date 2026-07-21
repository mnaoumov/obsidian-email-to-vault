import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

import type { PluginSettingsTab } from './plugin-settings-tab.ts';

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
      args: { pluginId: PLUGIN_ID, settingName: SETTING_NAME },
      async fn({ app, lib: { waitUntil }, pluginId, settingName }): Promise<MarkEmailsAsSeenToggleResult> {
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
        (settingTab as PluginSettingsTab).displayLegacy();

        const settingItems = Array.from(settingTab.containerEl.querySelectorAll('.setting-item'));
        const item = settingItems.find((el) => el.querySelector('.setting-item-name')?.textContent === settingName);
        const toggle = item?.querySelector<HTMLElement>('.checkbox-container');
        if (!toggle) {
          app.setting.close();
          return { ...notFound, error: 'Toggle not found' };
        }

        const initialEnabled = toggle.classList.contains('is-enabled');

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
          initialEnabled,
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
      vaultPath: getTempVault().path
    });

    expect(result.error).toBeNull();
    expect(result.toggleFound).toBe(true);
    expect(result.initialEnabled).toBe(true);
    expect(result.afterOff).toBe(false);
    expect(result.afterOn).toBe(true);
  });
});
