import { AppActiveFileProvider } from 'obsidian-dev-utils/obsidian/active-file-provider';
import { CommandHandlerComponent } from 'obsidian-dev-utils/obsidian/command-handlers/command-handler-component';
import { OpenSettingsCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-settings-command-handler';
import { PluginCommandRegistrar } from 'obsidian-dev-utils/obsidian/command-registrar';
import { MenuEventRegistrarComponent } from 'obsidian-dev-utils/obsidian/components/menu-event-registrar-component';
import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/components/plugin-settings-tab-component';
import { PluginDataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';
import { PluginEventSourceImpl } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import { CheckEmailsCommandHandler } from './command-handlers/check-emails-command-handler.ts';
import { RedownloadAllEmailsCommandHandler } from './command-handlers/redownload-all-emails-command-handler.ts';
import { RedownloadRecentEmailsCommandHandler } from './command-handlers/redownload-recent-emails-command-handler.ts';
import { EmailCheckerComponent } from './email-checker.ts';
import { EmailNoteCreator } from './email-note-creator.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { PluginSettings } from './plugin-settings.ts';
import { PrismComponent } from './prism-component.ts';
import { EmailProviderManagerComponent } from './providers/email-provider-manager.ts';
import { MailTmDomainManager } from './providers/mail-tm/mail-tm-domain-manager.ts';

export class Plugin extends PluginBase {
  protected override onloadImpl(): void {
    const mailTmDomainManager = new MailTmDomainManager();
    const pluginSettingsComponent = this.addChild(
      new PluginSettingsComponent({
        dataHandler: new PluginDataHandler(this),
        mailTmDomainManager,
        pluginEventSource: new PluginEventSourceImpl(this),
        pluginId: this.manifest.id,
        pluginSettingsClass: PluginSettings
      })
    );
    const emailProviderManager = this.addChild(
      new EmailProviderManagerComponent({
        app: this.app,
        mailTmDomainManager,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent
      })
    );

    const emailNoteCreator = new EmailNoteCreator({
      app: this.app,
      emailProvider: emailProviderManager,
      pluginNoticeComponent: this.pluginNoticeComponent,
      pluginSettingsComponent
    });
    const emailChecker = this.addChild(
      new EmailCheckerComponent({
        emailNoteCreator,
        emailProvider: emailProviderManager,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent
      })
    );
    const pluginSettingsTab = new PluginSettingsTab({
      emailProviderManager,
      plugin: this,
      pluginId: this.manifest.id,
      pluginNoticeComponent: this.pluginNoticeComponent,
      pluginSettingsComponent
    });
    this.addChild(
      new PluginSettingsTabComponent({
        plugin: this,
        pluginSettingsTab
      })
    );
    this.addChild(new PrismComponent());
    const menuEventRegistrar = this.addChild(new MenuEventRegistrarComponent(this.app));
    this.addChild(
      new CommandHandlerComponent({
        activeFileProvider: new AppActiveFileProvider(this.app),
        commandHandlers: [
          new CheckEmailsCommandHandler(emailChecker),
          new OpenSettingsCommandHandler({
            app: this.app,
            settingTab: pluginSettingsTab
          }),
          new RedownloadAllEmailsCommandHandler(emailChecker),
          new RedownloadRecentEmailsCommandHandler({
            app: this.app,
            emailChecker
          })
        ],
        commandRegistrar: new PluginCommandRegistrar(this),
        menuEventRegistrar,
        pluginName: this.manifest.name
      })
    );
  }
}
