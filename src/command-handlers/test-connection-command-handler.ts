import { GlobalCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/global-command-handler';

import type { EmailCheckerComponent } from '../email-checker.ts';

export class TestConnectionCommandHandler extends GlobalCommandHandler {
  public constructor(private readonly emailChecker: EmailCheckerComponent) {
    super({
      icon: 'plug-zap',
      id: 'test-connection',
      name: 'Test connection'
    });
  }

  public override async execute(): Promise<void> {
    await this.emailChecker.testConnection();
  }
}
