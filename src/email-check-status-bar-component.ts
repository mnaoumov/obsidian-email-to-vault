import type { AllWindowsStatusBarItemComponent } from '@mnaoumov/obsidian-lib/components/all-windows-status-bar-item-component';
import type { App } from 'obsidian';

import { registerAllWindowsStatusBarItem } from '@mnaoumov/obsidian-lib/components/all-windows-status-bar-item-component';
import { registerAsyncEvent } from '@mnaoumov/obsidian-lib/components/async-events-component';
import { ComponentEx } from '@mnaoumov/obsidian-lib/components/component-ex';
import { convertAsyncToSync } from '@mnaoumov/typescript-lib/async';
import {
  setIcon,
  setTooltip
} from 'obsidian';

import type { EmailCheckerComponent } from './email-checker.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import {
  formatEmailCheckStatusText,
  formatEmailCheckStatusTooltip
} from './email-check-status.ts';

// The item says "5 min ago", so it is redrawn often enough for that to stay true.
const REFRESH_INTERVAL_IN_MILLISECONDS = 30_000;

interface EmailCheckStatusBarComponentConstructorParams {
  readonly app: App;
  readonly emailChecker: EmailCheckerComponent;
  readonly pluginId: string;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

/**
 * The desktop status bar item that says when mail was last checked, how it went, and when the next check is due.
 * Clicking it checks emails now.
 */
export class EmailCheckStatusBarComponent extends ComponentEx {
  private readonly app: App;
  private readonly elsWithClickHandler = new WeakSet<HTMLElement>();
  private readonly emailChecker: EmailCheckerComponent;
  private item: AllWindowsStatusBarItemComponent | null = null;
  private readonly pluginId: string;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: EmailCheckStatusBarComponentConstructorParams) {
    super();
    this.app = params.app;
    this.emailChecker = params.emailChecker;
    this.pluginId = params.pluginId;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public override onload(): void {
    super.onload();
    this.updateVisibility();
    this.register(this.emailChecker.onStatusChanged(() => {
      this.item?.refresh();
    }));
    this.registerInterval(window.setInterval(() => {
      this.item?.refresh();
    }, REFRESH_INTERVAL_IN_MILLISECONDS));
    registerAsyncEvent(
      this,
      this.pluginSettingsComponent.on('saveSettings', () => {
        this.updateVisibility();
        this.item?.refresh();
      })
    );
  }

  private render(el: HTMLElement): void {
    if (!this.elsWithClickHandler.has(el)) {
      this.elsWithClickHandler.add(el);
      el.addClass('mod-clickable');
      el.addEventListener('click', convertAsyncToSync(() => this.emailChecker.checkEmails()));
    }

    // Without an address there is nothing to check, so the item would only take room.
    el.toggle(!!this.pluginSettingsComponent.settings.emailAddress);

    const status = this.emailChecker.getStatus();
    const now = new Date();
    el.empty();
    const iconEl = el.createSpan({ cls: 'email-to-vault-status-bar-icon' });
    setIcon(iconEl, status.lastError === null ? 'mail' : 'mail-warning');
    el.createSpan({ text: formatEmailCheckStatusText(status, now) });
    setTooltip(el, formatEmailCheckStatusTooltip(status, now), { placement: 'top' });
  }

  private updateVisibility(): void {
    const shouldShow = this.pluginSettingsComponent.settings.shouldShowStatusBarItem;
    if (shouldShow && !this.item) {
      this.item = registerAllWindowsStatusBarItem({
        app: this.app,
        cls: ['email-to-vault-status-bar-item'],
        component: this,
        pluginId: this.pluginId,
        render: ({ el }) => {
          this.render(el);
        }
      });
    } else if (!shouldShow && this.item) {
      this.removeChild(this.item);
      this.item = null;
    }
  }
}
