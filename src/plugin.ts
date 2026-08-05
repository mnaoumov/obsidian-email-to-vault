import { OpenDemoVaultCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler';
import { OpenSettingsCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-settings-command-handler';
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
import { EmailProviderManagerComponent } from './providers/email-provider-manager.ts';
import { MailTmDomainManager } from './providers/mail-tm/mail-tm-domain-manager.ts';
import { TokenizedStringLanguageComponent } from './tokenized-string-language-component.ts';

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
    this.addChild(new TokenizedStringLanguageComponent());
    this.commandHandlerComponent.registerCommandHandlers(() => [
      new CheckEmailsCommandHandler(emailChecker),
      new OpenDemoVaultCommandHandler({
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginVersion: this.manifest.version
      }),
      new OpenSettingsCommandHandler({
        app: this.app,
        settingTab: pluginSettingsTab
      }),
      new RedownloadAllEmailsCommandHandler(emailChecker),
      new RedownloadRecentEmailsCommandHandler({
        app: this.app,
        emailChecker
      })
    ]);
  }
}
