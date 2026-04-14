import type {
  App,
  PluginManifest
} from 'obsidian';
import type { ExtractReadonlyPluginSettingsWrapper } from 'obsidian-dev-utils/obsidian/plugin/plugin-types-base';

import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-base';

import type { PluginTypes } from './plugin-types.ts';

import { CheckEmailsCommand } from './commands/check-emails-command.ts';
import { OpenSettingsCommand } from './commands/open-settings-command.ts';
import { EmailChecker } from './email-checker.ts';
import { MailTmManager } from './mail-tm-manager.ts';
import { PluginSettingsManager } from './plugin-settings-manager.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';

export class Plugin extends PluginBase<PluginTypes> {
  private readonly emailChecker: EmailChecker;
  private readonly mailTmManager: MailTmManager;

  public constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
    this.mailTmManager = new MailTmManager(this);
    this.emailChecker = new EmailChecker(this, this.mailTmManager);
  }

  protected override createSettingsManager(): PluginSettingsManager {
    return new PluginSettingsManager(this, this.mailTmManager);
  }

  protected override createSettingsTab(): PluginSettingsTab {
    return new PluginSettingsTab(this, this.mailTmManager);
  }

  protected override async onloadImpl(): Promise<void> {
    await super.onloadImpl();
    new OpenSettingsCommand(this).register();
    new CheckEmailsCommand(this, this.emailChecker).register();
    this.emailChecker.scheduleCheckEmails();
  }

  protected override async onSaveSettings(
    newSettings: ExtractReadonlyPluginSettingsWrapper<PluginTypes>,
    oldSettings: ExtractReadonlyPluginSettingsWrapper<PluginTypes>,
    context: unknown
  ): Promise<void> {
    await super.onSaveSettings(newSettings, oldSettings, context);
    if (newSettings.settings.emailCheckIntervalInMinutes !== oldSettings.settings.emailCheckIntervalInMinutes) {
      this.emailChecker.scheduleCheckEmails();
    }
  }
}
