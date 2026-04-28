import { GlobalCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/global-command-handler';

import type { EmailChecker } from '../email-checker.ts';

export class CheckEmailsCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly emailChecker: EmailChecker) {
    super({
      icon: 'mail',
      id: 'check-emails',
      name: 'Check emails'
    });
  }

  public override async execute(): Promise<void> {
    await this.emailChecker.checkEmails();
  }
}
