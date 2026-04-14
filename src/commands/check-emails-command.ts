import { CommandInvocationBase } from 'obsidian-dev-utils/obsidian/commands/command-base';
import { NonEditorCommandBase } from 'obsidian-dev-utils/obsidian/commands/non-editor-command-base';

import type { EmailChecker } from '../email-checker.ts';
import type { Plugin } from '../plugin.ts';

class CheckEmailsCommandInvocation extends CommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin, private readonly emailChecker: EmailChecker) {
    super(plugin);
  }

  public override async execute(): Promise<void> {
    await this.emailChecker.checkEmails();
  }
}

export class CheckEmailsCommand extends NonEditorCommandBase<Plugin> {
  public constructor(plugin: Plugin, private readonly emailChecker: EmailChecker) {
    super({
      icon: 'mail',
      id: 'check-emails',
      name: 'Check emails',
      plugin
    });
  }

  public createCommandInvocation(): CommandInvocationBase {
    return new CheckEmailsCommandInvocation(this.plugin, this.emailChecker);
  }
}
