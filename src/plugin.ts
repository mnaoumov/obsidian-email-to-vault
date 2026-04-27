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
import { EmailProviderManager } from './providers/email-provider-manager.ts';
import { MailTmDomainManager } from './providers/mail-tm/mail-tm-domain-manager.ts';

export class Plugin extends PluginBase {
  public constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
    const mailTmDomainManager = this.addChild(new MailTmDomainManager());
    const pluginSettingsComponent = this.addChild(new PluginSettingsComponent(this, this.manifest.id, mailTmDomainManager));
    const emailProviderManager = this.addChild(new EmailProviderManager(this.app, this.manifest.id, pluginSettingsComponent, mailTmDomainManager));
    const emailNoteCreator = new EmailNoteCreator(this, pluginSettingsComponent, emailProviderManager);
    const emailChecker = this.addChild(new EmailChecker(pluginSettingsComponent, emailProviderManager, emailNoteCreator));
    this.addChild(
      new PluginSettingsTabComponent({
        plugin: this,
        pluginSettingsTab: new PluginSettingsTab({
          emailProviderManager,
          plugin: this,
          pluginId: this.manifest.id,
          pluginSettingsComponent
        })
      })
    );
    this.addChild(new PrismComponent());
    this.addChild(
      new CommandHandlerComponent({
        commandHandler: new CheckEmailsCommandHandler(this.manifest.name, emailChecker),
        plugin: this
      })
    );
    this.addChild(
      new CommandHandlerComponent({
        commandHandler: new RedownloadAllEmailsCommandHandler({
          emailChecker,
          pluginName: this.manifest.name
        }),
        plugin: this
      })
    );
    this.addChild(
      new CommandHandlerComponent({
        commandHandler: new RedownloadRecentEmailsCommandHandler({
          app: this.app,
          emailChecker,
          pluginName: this.manifest.name
        }),
        plugin: this
      })
    );
  }
}
