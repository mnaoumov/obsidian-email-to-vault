import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { EmailChecker } from '../email-checker.ts';

interface CheckEmailsCommandHandlerConstructorParams {
  emailChecker: EmailChecker;
  pluginName: string;
}

export class CheckEmailsCommandHandler extends GlobalCommandHandler {
  private readonly emailChecker: EmailChecker;

  public constructor(params: CheckEmailsCommandHandlerConstructorParams) {
    super({
      icon: 'mail',
      id: 'check-emails',
      name: 'Check emails',
      pluginName: params.pluginName
    });
    this.emailChecker = params.emailChecker;
  }

  public override async execute(): Promise<void> {
    await this.emailChecker.checkEmails();
  }
}
