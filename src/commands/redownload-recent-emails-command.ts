import type { App } from 'obsidian';

import { Modal } from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { CommandInvocationBase } from 'obsidian-dev-utils/obsidian/commands/command-base';
import { NonEditorCommandBase } from 'obsidian-dev-utils/obsidian/commands/non-editor-command-base';
import { SettingEx } from 'obsidian-dev-utils/obsidian/setting-ex';

import type { EmailChecker } from '../email-checker.ts';
import type { Plugin } from '../plugin.ts';

class RedownloadRecentEmailsCommandInvocation extends CommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin, private readonly emailChecker: EmailChecker) {
    super(plugin);
  }

  public override async execute(): Promise<void> {
    new RedownloadRecentEmailsModal(this.app, this.emailChecker).open();
    await Promise.resolve();
  }
}

/* v8 ignore start -- Modal UI requires Obsidian runtime. */
class RedownloadRecentEmailsModal extends Modal {
  public constructor(app: App, private readonly emailChecker: EmailChecker) {
    super(app);
  }

  public override onClose(): void {
    this.contentEl.empty();
  }

  public override onOpen(): void {
    this.contentEl.addClass('redownload-recent-emails-modal');
    this.setTitle('Redownload recent emails');

    let count = 0;

    new SettingEx(this.contentEl)
      .setName('Number of recent emails')
      .setDesc('Enter 0 to redownload all emails.')
      .addNumber((numberComponent) => {
        numberComponent.setMin(0);
        numberComponent.setValue(0);
        numberComponent.onChange((value) => {
          count = value;
        });
      });

    const redownload = convertAsyncToSync(async () => {
      this.close();
      await this.emailChecker.redownloadEmails(count === 0 ? undefined : count);
    });

    this.scope.register([], 'Enter', redownload);

    new SettingEx(this.contentEl)
      .addButton((button) => {
        button
          .setButtonText('Redownload')
          .setCta()
          .onClick(redownload);
      });
  }
}
/* v8 ignore stop */

export class RedownloadRecentEmailsCommand extends NonEditorCommandBase<Plugin> {
  public constructor(plugin: Plugin, private readonly emailChecker: EmailChecker) {
    super({
      icon: 'mail-question',
      id: 'redownload-recent-emails',
      name: 'Redownload recent emails',
      plugin
    });
  }

  public createCommandInvocation(): CommandInvocationBase {
    return new RedownloadRecentEmailsCommandInvocation(this.plugin, this.emailChecker);
  }
}
