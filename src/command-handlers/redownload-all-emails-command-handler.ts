import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { EmailCheckerComponent } from '../email-checker.ts';

export class RedownloadAllEmailsCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly emailChecker: EmailCheckerComponent) {
    super({
      icon: 'mail-search',
      id: 'redownload-all-emails',
      name: 'Redownload all emails'
    });
  }

  public override async execute(): Promise<void> {
    await this.emailChecker.redownloadEmails();
  }
}
