import type { App } from 'obsidian';

import { Modal } from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { CommandInvocationBase } from 'obsidian-dev-utils/obsidian/commands/command-base';
import { NonEditorCommandBase } from 'obsidian-dev-utils/obsidian/commands/non-editor-command-base';

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
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Redownload recent emails' });
    contentEl.createEl('p', { text: 'Enter the number of recent emails to redownload (0 = all):' });

    const input = contentEl.createEl('input', { type: 'number' });
    input.value = '0';
    input.setCssStyles({
      marginBottom: '1em',
      width: '100%'
    });

    const button = contentEl.createEl('button', { text: 'Redownload' });
    button.addEventListener(
      'click',
      convertAsyncToSync(async () => {
        const count = parseInt(input.value, 10);
        this.close();
        await this.emailChecker.redownloadEmails(count === 0 ? undefined : count);
      })
    );
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
