import type { App } from 'obsidian';

import { Modal } from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { noopAsync } from 'obsidian-dev-utils/function';
import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';
import { SettingEx } from 'obsidian-dev-utils/obsidian/setting-ex';

import type { EmailChecker } from '../email-checker.ts';

interface RedownloadRecentEmailsCommandHandlerConstructorParams {
  app: App;
  emailChecker: EmailChecker;
  pluginName: string;
}
/* v8 ignore stop */

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

export class RedownloadRecentEmailsCommandHandler extends GlobalCommandHandler {
  private readonly app: App;
  private readonly emailChecker: EmailChecker;

  public constructor(params: RedownloadRecentEmailsCommandHandlerConstructorParams) {
    super({
      icon: 'mail-question',
      id: 'redownload-recent-emails',
      name: 'Redownload recent emails',
      pluginName: params.pluginName
    });
    this.app = params.app;
    this.emailChecker = params.emailChecker;
  }

  public override async execute(): Promise<void> {
    await noopAsync();
    new RedownloadRecentEmailsModal(this.app, this.emailChecker).open();
  }
}
