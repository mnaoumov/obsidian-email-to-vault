import type { App } from 'obsidian';

import { Notice } from 'obsidian';
import {
  enableCommunityPlugin,
  installCommunityPlugin
} from 'obsidian-dev-utils/obsidian/community-plugins';

// Email to Vault fetches emails from a live mail service into your vault, so its real flow needs a
// Mailbox and a network connection that a code-button cannot fake. There is nothing for a button to
// Drive here — you configure an account in the plugin settings and run a command. The only helper the
// Vault needs is the shared CodeScript Toolkit installer used by the prerequisite note's button.
export async function installAndEnable(app: App, pluginId: string): Promise<void> {
  await installCommunityPlugin({ app, pluginId });
  await enableCommunityPlugin({ app, pluginId });
  new Notice(`Installed and enabled: ${pluginId}`);
}
