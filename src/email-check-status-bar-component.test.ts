import type { AllWindowsStatusBarItemRenderParams } from '@mnaoumov/obsidian-lib/components/all-windows-status-bar-item-component';
import type { AsyncEventRef } from '@mnaoumov/typescript-lib/async-events';
import type { App } from 'obsidian';

import { registerAllWindowsStatusBarItem } from '@mnaoumov/obsidian-lib/components/all-windows-status-bar-item-component';
import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  Component,
  setIcon,
  setTooltip
} from 'obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { EmailCheckStatus } from './email-check-status.ts';
import type { EmailCheckerComponent } from './email-checker.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type { PluginSettings } from './plugin-settings.ts';

import { EmailCheckStatusBarComponent } from './email-check-status-bar-component.ts';
import { INITIAL_EMAIL_CHECK_STATUS } from './email-check-status.ts';

vi.mock('@mnaoumov/obsidian-lib/components/all-windows-status-bar-item-component', () => ({
  registerAllWindowsStatusBarItem: vi.fn()
}));

vi.mock('obsidian', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian')>(),
  setIcon: vi.fn(),
  setTooltip: vi.fn()
}));

// Stub it to identity so the click handler is the raw async function and the test can await it.
vi.mock('@mnaoumov/typescript-lib/async', async (importOriginal) => ({
  ...await importOriginal<typeof import('@mnaoumov/typescript-lib/async')>(),
  convertAsyncToSync: vi.fn(($function: (...$arguments: unknown[]) => unknown) => $function)
}));

const REFRESH_INTERVAL_IN_MILLISECONDS = 30_000;

interface FakeItem extends Component {
  readonly refresh: ReturnType<typeof vi.fn>;
}

interface Harness {
  readonly checkEmails: ReturnType<typeof vi.fn>;
  readonly component: EmailCheckStatusBarComponent;
  readonly items: FakeItem[];
  readonly renderItem: (el: HTMLElement) => void;
  readonly setStatus: (status: EmailCheckStatus) => void;
  readonly settings: PluginSettings;
  readonly triggerSaveSettings: () => Promise<void>;
}

function createHarness(settingsOverrides?: Partial<PluginSettings>): Harness {
  const settings = castTo<PluginSettings>({
    emailAddress: 'test@mail.tm',
    shouldShowStatusBarItem: true,
    ...settingsOverrides
  });
  let status = INITIAL_EMAIL_CHECK_STATUS;
  let statusChangedHandler: (() => void) | null = null;
  let saveSettingsHandler: (() => Promise<void>) | null = null;
  const checkEmails = vi.fn(noopAsync);

  const emailChecker = strictProxy<EmailCheckerComponent>({
    checkEmails,
    getStatus: () => status,
    onStatusChanged: (handler: () => void) => {
      statusChangedHandler = handler;
      return vi.fn();
    }
  });
  const pluginSettingsComponent = strictProxy<PluginSettingsComponent>({
    on: vi.fn((_name: string, handler: () => Promise<void>) => {
      saveSettingsHandler = handler;
      return strictProxy<AsyncEventRef>({ callback: vi.fn() });
    }),
    settings
  });

  const items: FakeItem[] = [];
  const renderCallbacks: ((params: AllWindowsStatusBarItemRenderParams) => void)[] = [];
  vi.mocked(registerAllWindowsStatusBarItem).mockImplementation((params) => {
    const item = castTo<FakeItem>(Object.assign(new Component(), { refresh: vi.fn() }));
    params.component.addChild(item);
    items.push(item);
    renderCallbacks.push(params.render);
    return castTo<ReturnType<typeof registerAllWindowsStatusBarItem>>(item);
  });

  const component = new EmailCheckStatusBarComponent({
    app: strictProxy<App>({}),
    emailChecker,
    pluginId: 'email-to-vault',
    pluginSettingsComponent
  });
  component.load();

  return {
    checkEmails,
    component,
    items,
    renderItem(el: HTMLElement): void {
      const render = renderCallbacks.at(-1);
      if (!render) {
        throw new Error('No status bar item was registered');
      }
      render({ el, win: window });
    },
    setStatus(newStatus: EmailCheckStatus): void {
      status = newStatus;
      statusChangedHandler?.();
    },
    settings,
    async triggerSaveSettings(): Promise<void> {
      await saveSettingsHandler?.();
    }
  };
}

describe('EmailCheckStatusBarComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register one status bar item for the plugin', () => {
    createHarness();

    expect(registerAllWindowsStatusBarItem).toHaveBeenCalledOnce();
    expect(registerAllWindowsStatusBarItem).toHaveBeenCalledWith(expect.objectContaining({
      cls: ['email-to-vault-status-bar-item'],
      pluginId: 'email-to-vault'
    }));
  });

  it('should register nothing when the status bar item is turned off', () => {
    createHarness({ shouldShowStatusBarItem: false });

    expect(registerAllWindowsStatusBarItem).not.toHaveBeenCalled();
  });

  it('should render the status text, icon and tooltip', () => {
    const { renderItem } = createHarness();
    const el = createDiv();

    renderItem(el);

    expect(el.textContent).toBe('Not checked yet · auto-check off');
    expect(el.style.display).not.toBe('none');
    expect(setIcon).toHaveBeenCalledWith(expect.any(HTMLElement), 'mail');
    expect(setTooltip).toHaveBeenCalledWith(el, expect.stringContaining('Click to check emails now'), { placement: 'top' });
  });

  it('should show a warning icon after a failed check', () => {
    const { renderItem, setStatus } = createHarness();
    setStatus({ ...INITIAL_EMAIL_CHECK_STATUS, lastCheckAt: new Date(), lastError: 'boom' });

    renderItem(createDiv());

    expect(setIcon).toHaveBeenCalledWith(expect.any(HTMLElement), 'mail-warning');
  });

  it('should hide the item while there is no email address', () => {
    const { renderItem } = createHarness({ emailAddress: '' });
    const el = createDiv();

    renderItem(el);

    expect(el.style.display).toBe('none');
  });

  it('should check emails on a click, with one handler however often it renders', async () => {
    const { checkEmails, renderItem } = createHarness();
    const el = createDiv();
    renderItem(el);
    renderItem(el);

    el.click();
    await noopAsync();

    expect(checkEmails).toHaveBeenCalledOnce();
    expect(el.hasClass('mod-clickable')).toBe(true);
  });

  it('should refresh the item when the status changes', () => {
    const { items, setStatus } = createHarness();

    setStatus({ ...INITIAL_EMAIL_CHECK_STATUS, isChecking: true });

    expect(items[0]?.refresh).toHaveBeenCalledOnce();
  });

  it('should refresh the item on a timer, so relative times stay true', () => {
    vi.useFakeTimers();
    try {
      const { items } = createHarness();

      vi.advanceTimersByTime(REFRESH_INTERVAL_IN_MILLISECONDS);

      expect(items[0]?.refresh).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should remove the item when the setting is turned off and add it back when turned on', async () => {
    const { component, items, settings, triggerSaveSettings } = createHarness();
    const removeChildSpy = vi.spyOn(component, 'removeChild');

    settings.shouldShowStatusBarItem = false;
    await triggerSaveSettings();
    expect(removeChildSpy).toHaveBeenCalledWith(items[0]);

    settings.shouldShowStatusBarItem = true;
    await triggerSaveSettings();
    expect(items).toHaveLength(2);
    expect(items[1]?.refresh).toHaveBeenCalledOnce();
  });

  it('should keep the item when an unrelated setting is saved', async () => {
    const { items, triggerSaveSettings } = createHarness();

    await triggerSaveSettings();

    expect(items).toHaveLength(1);
    expect(items[0]?.refresh).toHaveBeenCalledOnce();
  });

  it('should do nothing on a save while the item stays off', async () => {
    const { items, triggerSaveSettings } = createHarness({ shouldShowStatusBarItem: false });

    await triggerSaveSettings();

    expect(items).toHaveLength(0);
  });
});
