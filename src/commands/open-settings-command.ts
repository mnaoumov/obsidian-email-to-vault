import { CommandInvocationBase } from 'obsidian-dev-utils/obsidian/commands/command-base';
import { NonEditorCommandBase } from 'obsidian-dev-utils/obsidian/commands/non-editor-command-base';

import type { Plugin } from '../plugin.ts';

class OpenSettingsCommandInvocation extends CommandInvocationBase<Plugin> {
  public constructor(plugin: Plugin) {
    super(plugin);
  }

  public override async execute(): Promise<void> {
    this.app.setting.openTabById(this.plugin.manifest.id);
    this.app.setting.open();
  }
}

export class OpenSettingsCommand extends NonEditorCommandBase<Plugin> {
  public constructor(plugin: Plugin) {
    super({
      icon: 'settings',
      id: 'open-settings',
      name: 'Open settings',
      plugin
    });
  }

  protected override createCommandInvocation(): CommandInvocationBase {
    return new OpenSettingsCommandInvocation(this.plugin);
  }
}
