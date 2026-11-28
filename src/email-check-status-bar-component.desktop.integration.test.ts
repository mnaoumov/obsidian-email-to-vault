import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

interface PluginWithSettingsComponent {
  readonly pluginSettingsComponent?: SettingsComponentLike;
}

interface SettingsComponentLike {
  readonly editAndSave: (editor: (settings: ShowStatusBarSettings) => void) => Promise<void>;
}

interface ShowStatusBarSettings {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- The integration test changes the settings through the settings component.
  emailAddress: string;
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- The integration test changes the settings through the settings component.
  shouldShowStatusBarItem: boolean;
}

interface StatusBarItemResult {
  readonly afterTurnedBackOn: number;
  readonly afterTurnedOff: number;
  readonly displayWithAddress: string;
  readonly displayWithoutAddress: string;
  readonly error: null | string;
  readonly initialCount: number;
  readonly textWithAddress: string;
}

const PLUGIN_ID = 'email-to-vault';

describe('EmailCheckStatusBarComponent on desktop', () => {
  it('should show one item in the status bar, hidden without an address, removed and restored by the setting', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil }, pluginId }): Promise<StatusBarItemResult> {
        const failed: StatusBarItemResult = {
          afterTurnedBackOn: -1,
          afterTurnedOff: -1,
          displayWithAddress: '',
          displayWithoutAddress: '',
          error: null,
          initialCount: -1,
          textWithAddress: ''
        };
        const plugin = app.plugins.getPlugin(pluginId) as null | PluginWithSettingsComponent;
        const settingsComponent = plugin?.pluginSettingsComponent;
        if (!settingsComponent) {
          return { ...failed, error: 'Plugin settings component not found' };
        }

        const selector = '.status-bar > .status-bar-item.email-to-vault-status-bar-item';

        await settingsComponent.editAndSave((settings) => {
          settings.emailAddress = '';
          settings.shouldShowStatusBarItem = true;
        });
        const initialCount = getItems().length;
        const displayWithoutAddress = getItems()[0]?.style.display ?? '';

        await settingsComponent.editAndSave((settings) => {
          settings.emailAddress = 'email-to-vault-status-bar-test@example.com';
        });
        const displayWithAddress = getItems()[0]?.style.display ?? '';
        const textWithAddress = getItems()[0]?.textContent ?? '';

        await settingsComponent.editAndSave((settings) => {
          settings.shouldShowStatusBarItem = false;
        });
        await waitUntil({ message: 'The status bar item was not removed', predicate: () => getItems().length === 0 });
        const afterTurnedOff = getItems().length;

        await settingsComponent.editAndSave((settings) => {
          settings.shouldShowStatusBarItem = true;
        });
        await waitUntil({ message: 'The status bar item was not added back', predicate: () => getItems().length === 1 });
        const afterTurnedBackOn = getItems().length;

        await settingsComponent.editAndSave((settings) => {
          settings.emailAddress = '';
        });

        return {
          afterTurnedBackOn,
          afterTurnedOff,
          displayWithAddress,
          displayWithoutAddress,
          error: null,
          initialCount,
          textWithAddress
        };

        function getItems(): HTMLElement[] {
          return [...activeDocument.querySelectorAll<HTMLElement>(selector)];
        }
      },
      input: { pluginId: PLUGIN_ID },
      vaultPath: getTemporaryVault().path
    });

    expect(result.error).toBeNull();
    expect(result.initialCount).toBe(1);
    expect(result.displayWithoutAddress).toBe('none');
    expect(result.displayWithAddress).not.toBe('none');
    expect(result.textWithAddress).toContain('Not checked yet');
    expect(result.afterTurnedOff).toBe(0);
    expect(result.afterTurnedBackOn).toBe(1);
  });
});
