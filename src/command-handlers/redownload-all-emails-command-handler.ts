import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { EmailChecker } from '../email-checker.ts';

interface RedownloadAllEmailsCommandHandlerConstructorParams {
  emailChecker: EmailChecker;
  pluginName: string;
}

export class RedownloadAllEmailsCommandHandler extends GlobalCommandHandler {
  private readonly emailChecker: EmailChecker;

  public constructor(params: RedownloadAllEmailsCommandHandlerConstructorParams) {
    super({
      icon: 'mail-search',
      id: 'redownload-all-emails',
      name: 'Redownload all emails',
      pluginName: params.pluginName
    });
    this.emailChecker = params.emailChecker;
  }

  public override async execute(): Promise<void> {
    await this.emailChecker.redownloadEmails();
  }
}
