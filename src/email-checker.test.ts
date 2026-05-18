import type { AsyncEventRef } from 'obsidian-dev-utils/async-events';
import type { ReadonlyPluginSettingsState } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';
import type { Promisable } from 'type-fest';

import { Notice } from 'obsidian';
import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { EmailNoteCreator } from './email-note-creator.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';
import type { PluginSettings } from './plugin-settings.ts';
import type { EmailProvider } from './providers/email-provider.ts';

import { EmailChecker } from './email-checker.ts';

vi.mock('obsidian', async (importOriginal) => {
  const original = await importOriginal<typeof import('obsidian')>();
  return {
    ...original,
    Notice: vi.fn()
  };
});

vi.mock('obsidian-dev-utils/obsidian/components/async-events-component', () => ({
  registerAsyncEvent: vi.fn()
}));

const mockNotice = vi.mocked(Notice);

vi.stubGlobal('window', {
  clearInterval: vi.fn(),
  setInterval: vi.fn(() => 0)
});

interface CreateMockPluginSettingsComponentResult {
  pluginSettingsComponent: PluginSettingsComponent;
  triggerSaveSettings(newState: ReadonlyPluginSettingsState<PluginSettings>, oldState: ReadonlyPluginSettingsState<PluginSettings>): void;
}

interface MockEmailProviderOverrides {
  deleteMessage?: EmailProvider['deleteMessage'];
  getMessages?: EmailProvider['getMessages'];
  markMessageAsSeen?: EmailProvider['markMessageAsSeen'];
}

interface MockPluginSettingsComponentOverrides {
  emailAddress?: string;
  emailCheckIntervalInMinutes?: number;
  shouldDeleteSeenEmails?: boolean;
}

type SaveSettingsCallback = (
  newState: ReadonlyPluginSettingsState<PluginSettings>,
  oldState: ReadonlyPluginSettingsState<PluginSettings>,
  context: unknown
) => Promisable<void>;

function createMockEmailProvider(overrides?: MockEmailProviderOverrides): EmailProvider {
  return strictProxy<EmailProvider>({
    deleteMessage: overrides?.deleteMessage ?? vi.fn(),
    getMessages: overrides?.getMessages ?? vi.fn(async () => {
      await noopAsync();
      return [];
    }),
    markMessageAsSeen: overrides?.markMessageAsSeen ?? vi.fn()
  });
}

function createMockNoteCreator(): EmailNoteCreator {
  return strictProxy<EmailNoteCreator>({
    saveEmailAsNote: vi.fn()
  });
}

function createMockPluginSettingsComponent(overrides?: MockPluginSettingsComponentOverrides): CreateMockPluginSettingsComponentResult {
  let saveSettingsCallback: null | SaveSettingsCallback = null;

  const component = strictProxy<PluginSettingsComponent>({
    on: vi.fn((_name: string, callback: (...args: unknown[]) => unknown) => {
      saveSettingsCallback = castTo<SaveSettingsCallback>(callback);
      return strictProxy<AsyncEventRef>({
        asyncEvents: {},
        callback: vi.fn()
      });
    }) as PluginSettingsComponent['on'],
    registerInterval: vi.fn((id: number) => id),
    settings: {
      emailAddress: overrides?.emailAddress ?? 'test@mail.tm',
      emailCheckIntervalInMinutes: overrides?.emailCheckIntervalInMinutes ?? 10,
      shouldDeleteSeenEmails: overrides?.shouldDeleteSeenEmails ?? false
    }
  });

  return {
    pluginSettingsComponent: component,
    triggerSaveSettings(newState: ReadonlyPluginSettingsState<PluginSettings>, oldState: ReadonlyPluginSettingsState<PluginSettings>): void {
      if (saveSettingsCallback) {
        saveSettingsCallback(newState, oldState, undefined);
      }
    }
  };
}

function createSettingsState(intervalInMinutes: number): ReadonlyPluginSettingsState<PluginSettings> {
  return {
    effectiveValues: {
      emailCheckIntervalInMinutes: intervalInMinutes
    },
    inputValues: {
      emailCheckIntervalInMinutes: intervalInMinutes
    },
    validationMessages: {}
  } as ReadonlyPluginSettingsState<PluginSettings>;
}

describe('EmailChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(window.setInterval).mockReturnValue(castTo<ReturnType<typeof window.setInterval>>(0));
  });

  describe('checkEmails', () => {
    it('should return early when no email address configured', async () => {
      const emailProvider = createMockEmailProvider();
      const { pluginSettingsComponent } = createMockPluginSettingsComponent({ emailAddress: '' });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginSettingsComponent
      });

      await checker.checkEmails();

      expect(emailProvider.getMessages).not.toHaveBeenCalled();
    });

    it('should show notice when no unseen messages', async () => {
      const emailProvider = createMockEmailProvider({
        getMessages: vi.fn(async () => {
          await noopAsync();
          return [
            {
              createdAt: '2026-01-01T00:00:00+00:00',

              from: { address: 'a@b.com', name: '' },
              hasAttachments: false,
              id: '1',
              seen: true,

              subject: 'Old',
              to: []
            }
          ];
        })
      });
      const { pluginSettingsComponent } = createMockPluginSettingsComponent();
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginSettingsComponent
      });

      await checker.checkEmails();

      expect(mockNotice).toHaveBeenCalledWith('No new emails');
    });

    it('should delegate to noteCreator.saveEmailAsNote for unseen messages', async () => {
      const unseenMessage = {
        createdAt: '2026-01-01T00:00:00+00:00',
        from: { address: 'sender@example.com', name: 'Sender' },
        hasAttachments: false,
        id: 'msg1',
        seen: false,
        subject: 'Test Email',
        to: [{ address: 'me@mail.tm', name: '' }]
      };
      const emailProvider = createMockEmailProvider({
        getMessages: vi.fn(async () => {
          await noopAsync();
          return [unseenMessage];
        })
      });
      const { pluginSettingsComponent } = createMockPluginSettingsComponent();
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginSettingsComponent
      });

      await checker.checkEmails();

      expect(noteCreator.saveEmailAsNote).toHaveBeenCalledWith(unseenMessage);
      expect(mockNotice).toHaveBeenCalledWith('Saved 1 new email(s)');
    });

    it('should delete message after save when shouldDeleteSeenEmails is enabled', async () => {
      const emailProvider = createMockEmailProvider({
        getMessages: vi.fn(async () => {
          await noopAsync();
          return [
            {
              createdAt: '2026-01-01T00:00:00+00:00',

              from: { address: 'a@b.com', name: '' },
              hasAttachments: false,
              id: 'msg1',
              seen: false,

              subject: 'Test',
              to: []
            }
          ];
        })
      });
      const { pluginSettingsComponent } = createMockPluginSettingsComponent({ shouldDeleteSeenEmails: true });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginSettingsComponent
      });

      await checker.checkEmails();

      expect(emailProvider.deleteMessage).toHaveBeenCalledWith('msg1');
    });

    it('should mark message as seen when shouldDeleteSeenEmails is disabled', async () => {
      const emailProvider = createMockEmailProvider({
        getMessages: vi.fn(async () => {
          await noopAsync();
          return [
            {
              createdAt: '2026-01-01T00:00:00+00:00',

              from: { address: 'a@b.com', name: '' },
              hasAttachments: false,
              id: 'msg1',
              seen: false,

              subject: 'Test',
              to: []
            }
          ];
        })
      });
      const { pluginSettingsComponent } = createMockPluginSettingsComponent({ shouldDeleteSeenEmails: false });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginSettingsComponent
      });

      await checker.checkEmails();

      expect(emailProvider.deleteMessage).not.toHaveBeenCalled();
      expect(emailProvider.markMessageAsSeen).toHaveBeenCalledWith('msg1');
    });
  });

  describe('redownloadEmails', () => {
    it('should redownload all messages regardless of seen status', async () => {
      const emailProvider = createMockEmailProvider({
        getMessages: vi.fn(async () => {
          await noopAsync();
          return [
            {
              createdAt: '2026-01-01T00:00:00+00:00',

              from: { address: 'a@b.com', name: '' },
              hasAttachments: false,
              id: 'msg1',
              seen: true,

              subject: 'Test',
              to: []
            },
            {
              createdAt: '2026-01-01T00:00:00+00:00',

              from: { address: 'a@b.com', name: '' },
              hasAttachments: false,
              id: 'msg2',
              seen: true,

              subject: 'Test2',
              to: []
            }
          ];
        })
      });
      const { pluginSettingsComponent } = createMockPluginSettingsComponent();
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginSettingsComponent
      });

      await checker.redownloadEmails();

      expect(noteCreator.saveEmailAsNote).toHaveBeenCalledTimes(2);
      expect(mockNotice).toHaveBeenCalledWith('Redownloaded 2 email(s)');
    });

    it('should limit to count when specified', async () => {
      const emailProvider = createMockEmailProvider({
        getMessages: vi.fn(async () => {
          await noopAsync();
          return [
            {
              createdAt: '2026-01-01T00:00:00+00:00',

              from: { address: 'a@b.com', name: '' },
              hasAttachments: false,
              id: 'msg1',
              seen: false,

              subject: 'Test',
              to: []
            },
            {
              createdAt: '2026-01-01T00:00:00+00:00',

              from: { address: 'a@b.com', name: '' },
              hasAttachments: false,
              id: 'msg2',
              seen: false,

              subject: 'Test2',
              to: []
            }
          ];
        })
      });
      const { pluginSettingsComponent } = createMockPluginSettingsComponent();
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginSettingsComponent
      });

      await checker.redownloadEmails(1);

      expect(noteCreator.saveEmailAsNote).toHaveBeenCalledTimes(1);
      expect(mockNotice).toHaveBeenCalledWith('Redownloaded 1 email(s)');
    });
  });

  describe('onload', () => {
    it('should not schedule when interval is 0', () => {
      const emailProvider = createMockEmailProvider();
      const { pluginSettingsComponent } = createMockPluginSettingsComponent({ emailCheckIntervalInMinutes: 0 });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginSettingsComponent
      });

      checker.load();

      expect(pluginSettingsComponent.registerInterval).not.toHaveBeenCalled();
    });

    it('should schedule with correct interval', () => {
      const mockSetInterval = vi.fn(() => 42);
      vi.stubGlobal('window', {
        clearInterval: vi.fn(),
        setInterval: mockSetInterval
      });

      const emailProvider = createMockEmailProvider();
      const { pluginSettingsComponent } = createMockPluginSettingsComponent({ emailCheckIntervalInMinutes: 5 });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginSettingsComponent
      });

      checker.load();

      const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), FIVE_MINUTES_IN_MS);
    });

    it('should register saveSettings event listener', () => {
      const emailProvider = createMockEmailProvider();
      const { pluginSettingsComponent } = createMockPluginSettingsComponent();
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginSettingsComponent
      });

      checker.load();

      expect(pluginSettingsComponent.on).toHaveBeenCalledWith('saveSettings', expect.any(Function));
    });

    it('should reschedule when emailCheckIntervalInMinutes changes', () => {
      const mockClearInterval = vi.fn();
      const mockSetInterval = vi.fn(() => 1);
      vi.stubGlobal('window', {
        clearInterval: mockClearInterval,
        setInterval: mockSetInterval
      });

      const emailProvider = createMockEmailProvider();
      const { pluginSettingsComponent, triggerSaveSettings } = createMockPluginSettingsComponent({ emailCheckIntervalInMinutes: 5 });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginSettingsComponent
      });

      checker.load();
      mockSetInterval.mockClear();

      const oldState = createSettingsState(5);
      const newState = createSettingsState(15);
      triggerSaveSettings(newState, oldState);

      expect(mockClearInterval).toHaveBeenCalled();
      expect(mockSetInterval).toHaveBeenCalled();
    });

    it('should not reschedule when emailCheckIntervalInMinutes does not change', () => {
      const mockSetInterval = vi.fn(() => 1);
      vi.stubGlobal('window', {
        clearInterval: vi.fn(),
        setInterval: mockSetInterval
      });

      const emailProvider = createMockEmailProvider();
      const { pluginSettingsComponent, triggerSaveSettings } = createMockPluginSettingsComponent({ emailCheckIntervalInMinutes: 5 });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginSettingsComponent
      });

      checker.load();
      mockSetInterval.mockClear();

      const state = createSettingsState(5);
      triggerSaveSettings(state, state);

      expect(mockSetInterval).not.toHaveBeenCalled();
    });

    it('should clear previous interval before scheduling new one', () => {
      const mockClearInterval = vi.fn();
      vi.stubGlobal('window', {
        clearInterval: mockClearInterval,
        setInterval: vi.fn(() => 1)
      });

      const emailProvider = createMockEmailProvider();
      const { pluginSettingsComponent, triggerSaveSettings } = createMockPluginSettingsComponent({ emailCheckIntervalInMinutes: 5 });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailChecker({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginSettingsComponent
      });

      checker.load();

      const oldState = createSettingsState(5);
      const newState = createSettingsState(10);
      triggerSaveSettings(newState, oldState);

      expect(mockClearInterval).toHaveBeenCalled();
    });
  });
});
