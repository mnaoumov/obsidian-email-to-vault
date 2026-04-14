/* v8 ignore start -- Requires Obsidian runtime for vault traversal and AbstractInputSuggest DOM. */

import type { App } from 'obsidian';

import { AbstractInputSuggest } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<string> {
  public constructor(app: App, textInputEl: HTMLInputElement) {
    super(app, textInputEl);
  }

  public override getSuggestions(input: string): string[] {
    const folders = this.getFolderPaths();
    return folders
      .filter((folder) => folder.toLowerCase().includes(input.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
  }

  public override renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value || '/');
  }

  public override selectSuggestion(value: string): void {
    this.setValue(value);
    this.textInputEl.dispatchEvent(new Event('input'));
    activeWindow.setTimeout(() => {
      this.close();
      this.textInputEl.blur();
    }, 0);
  }

  private collectFolders(path: string, folders: string[]): void {
    folders.push(path);
    const folder = this.app.vault.getFolderByPath(path);
    if (!folder) {
      return;
    }

    for (const child of folder.children) {
      if ('children' in child) {
        this.collectFolders(child.path, folders);
      }
    }
  }

  private getFolderPaths(): string[] {
    const folders: string[] = [];
    const root = this.app.vault.getRoot();

    for (const child of root.children) {
      if ('children' in child) {
        this.collectFolders(child.path, folders);
      }
    }

    return folders;
  }
}

/* v8 ignore stop */
