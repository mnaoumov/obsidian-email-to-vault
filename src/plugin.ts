import type {
  App,
  PluginManifest
} from 'obsidian';

import { CommandHandlerComponent } from 'obsidian-dev-utils/obsidian/command-handlers/command-handler-component';
import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/plugin/components/plugin-settings-tab-component';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';

import { CheckEmailsCommandHandler } from './command-handlers/check-emails-command-handler.ts';
import { RedownloadAllEmailsCommandHandler } from './command-handlers/redownload-all-emails-command-handler.ts';
import { RedownloadRecentEmailsCommandHandler } from './command-handlers/redownload-recent-emails-command-handler.ts';
import { EmailChecker } from './email-checker.ts';
import { EmailNoteCreator } from './email-note-creator.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { PrismComponent } from './prism-component.ts';
import { MailTmDomainManager } from './providers/mail-tm/mail-tm-domain-manager.ts';
import { MailTmProvider } from './providers/mail-tm/mail-tm-provider.ts';

export class Plugin extends PluginBase {
  public constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
    const mailTmDomainManager = this.registerComponent({ component: new MailTmDomainManager() });
    const pluginSettingsComponent = this.registerComponent({
      component: new PluginSettingsComponent(this, this.manifest.id, mailTmDomainManager),
      shouldPreload: true
    });
    const mailTmManager = this.registerComponent({ component: new MailTmProvider(this.app, this.manifest.id, pluginSettingsComponent, mailTmDomainManager) });
    const emailNoteCreator = new EmailNoteCreator(this, pluginSettingsComponent, mailTmManager);
    const emailChecker = this.registerComponent({ component: new EmailChecker(pluginSettingsComponent, mailTmManager, emailNoteCreator) });
    this.registerComponent({
      component: new PluginSettingsTabComponent(this, new PluginSettingsTab(this, pluginSettingsComponent, mailTmManager, this.manifest.id)),
      shouldPreload: true
    });
    this.registerComponent({ component: new PrismComponent() });
    this.registerComponent({ component: new CommandHandlerComponent(this, new CheckEmailsCommandHandler(this.manifest.name, emailChecker)) });
    this.registerComponent({ component: new CommandHandlerComponent(this, new RedownloadAllEmailsCommandHandler(this.manifest.name, emailChecker)) });
    this.registerComponent({
      component: new CommandHandlerComponent(this, new RedownloadRecentEmailsCommandHandler(this.app, this.manifest.name, emailChecker))
    });
  }
}
