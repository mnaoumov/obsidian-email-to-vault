import { CommandInvocationBase } from 'obsidian-dev-utils/obsidian/commands/command-base';
import { NonEditorCommandBase } from 'obsidian-dev-utils/obsidian/commands/non-editor-command-base';

import type { EmailChecker } from '../email-checker.ts';
import type { Plugin } from '../plugin.ts';

class RedownloadAllEmailsCommandInvocation extends CommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin, private readonly emailChecker: EmailChecker) {
    super(plugin);
  }

  public override async execute(): Promise<void> {
    await this.emailChecker.redownloadEmails();
  }
}

export class RedownloadAllEmailsCommand extends NonEditorCommandBase<Plugin> {
  public constructor(plugin: Plugin, private readonly emailChecker: EmailChecker) {
    super({
      icon: 'mail-search',
      id: 'redownload-all-emails',
      name: 'Redownload all emails',
      plugin
    });
  }

  public createCommandInvocation(): CommandInvocationBase {
    return new RedownloadAllEmailsCommandInvocation(this.plugin, this.emailChecker);
  }
}
