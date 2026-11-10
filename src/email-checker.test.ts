import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type { ReadonlyPluginSettingsState } from '@mnaoumov/obsidian-lib/components/plugin-settings-component';
import type { AsyncEventRef } from '@mnaoumov/typescript-lib/async-events';
import type { Promisable } from 'type-fest';

import {
  registerAsyncErrorEventHandler,
  startAsyncErrorIgnoreContext
} from '@mnaoumov/typescript-lib/error';
import {
  noop,
  noopAsync
} from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { setImmediate } from 'node:timers/promises';
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

import { EmailCheckerComponent } from './email-checker.ts';
import { EmailProviderAuthenticationError } from './providers/email-provider-authentication-error.ts';
import { EmailProviderRateLimitError } from './providers/email-provider-rate-limit-error.ts';
import { EmailProviderType } from './providers/email-provider-type.ts';

const mockShowNotice = vi.fn();

vi.stubGlobal('window', {
  clearInterval: vi.fn(),
  setInterval: vi.fn(() => 0)
});

interface CreateMockPluginSettingsComponentResult {
  readonly pluginSettingsComponent: PluginSettingsComponent;
  readonly triggerSaveSettings: (newState: ReadonlyPluginSettingsState<PluginSettings>, oldState: ReadonlyPluginSettingsState<PluginSettings>) => Promise<void>;
}

interface MockEmailProviderOverrides {
  readonly deleteMessage?: EmailProvider['deleteMessage'];
  readonly getMessages?: EmailProvider['getMessages'];
  readonly markMessageAsSeen?: EmailProvider['markMessageAsSeen'];
}

interface MockPluginSettingsComponentOverrides {
  readonly emailAddress?: string;
  readonly emailCheckIntervalInMinutes?: number;
  readonly emailProviderType?: EmailProviderType;
  readonly lastProcessedEmailTimestamp?: string;
  readonly shouldDeleteSeenEmails?: boolean;
  readonly shouldMarkEmailsAsSeen?: boolean;
}

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
  type SaveSettingsCallback = (
    newState: ReadonlyPluginSettingsState<PluginSettings>,
    oldState: ReadonlyPluginSettingsState<PluginSettings>,
    context: unknown
  ) => Promisable<void>;
  let saveSettingsCallback: null | SaveSettingsCallback = null;

  const settings = castTo<PluginSettings>({
    emailAddress: overrides?.emailAddress ?? 'test@mail.tm',
    emailCheckIntervalInMinutes: overrides?.emailCheckIntervalInMinutes ?? 10,
    emailProviderType: overrides?.emailProviderType ?? EmailProviderType.MailTm,
    lastProcessedEmailTimestamp: overrides?.lastProcessedEmailTimestamp ?? '',
    shouldDeleteSeenEmails: overrides?.shouldDeleteSeenEmails ?? false,
    shouldMarkEmailsAsSeen: overrides?.shouldMarkEmailsAsSeen ?? true
  });

  const component = strictProxy<PluginSettingsComponent>({
    editAndSave: vi.fn(async (editor: (settings: PluginSettings) => void) => {
      editor(settings);
      await noopAsync();
    }),
    on: vi.fn((_name: string, callback: (...$arguments: unknown[]) => unknown) => {
      saveSettingsCallback = castTo<SaveSettingsCallback>(callback);
      return strictProxy<AsyncEventRef>({
        callback: vi.fn()
      });
    }) as PluginSettingsComponent['on'],
    registerInterval: vi.fn((id: number) => id),
    settings
  });

  return {
    pluginSettingsComponent: component,
    async triggerSaveSettings(newState: ReadonlyPluginSettingsState<PluginSettings>, oldState: ReadonlyPluginSettingsState<PluginSettings>): Promise<void> {
      if (saveSettingsCallback) {
        await saveSettingsCallback(newState, oldState, undefined);
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
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
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
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });

      await checker.checkEmails();

      expect(mockShowNotice).toHaveBeenCalledWith('No new emails');
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
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });

      await checker.checkEmails();

      expect(noteCreator.saveEmailAsNote).toHaveBeenCalledWith(unseenMessage);
      expect(mockShowNotice).toHaveBeenCalledWith('Saved 1 new email(s)');
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
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
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
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });

      await checker.checkEmails();

      expect(emailProvider.deleteMessage).not.toHaveBeenCalled();
      expect(emailProvider.markMessageAsSeen).toHaveBeenCalledWith('msg1');
    });

    it('should neither mark as seen nor delete when shouldMarkEmailsAsSeen is disabled', async () => {
      const emailProvider = createMockEmailProvider({
        getMessages: vi.fn(async () => {
          await noopAsync();
          return [
            {
              createdAt: '2026-01-02T00:00:00.000Z',
              from: { address: 'a@b.com', name: '' },
              hasAttachments: false,
              id: 'msg2',
              seen: false,
              subject: 'New',
              to: []
            }
          ];
        })
      });
      const { pluginSettingsComponent } = createMockPluginSettingsComponent({
        lastProcessedEmailTimestamp: '2026-01-01T00:00:00.000Z',
        shouldMarkEmailsAsSeen: false
      });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });

      await checker.checkEmails();

      expect(noteCreator.saveEmailAsNote).toHaveBeenCalledTimes(1);
      expect(emailProvider.markMessageAsSeen).not.toHaveBeenCalled();
      expect(emailProvider.deleteMessage).not.toHaveBeenCalled();
    });

    it('should select messages strictly newer than the bookmark in timestamp mode', async () => {
      const olderMessage = {
        createdAt: '2026-01-01T00:00:00.000Z',
        from: { address: 'a@b.com', name: '' },
        hasAttachments: false,
        id: 'older',
        seen: false,
        subject: 'Older',
        to: []
      };
      const boundaryMessage = {
        createdAt: '2026-01-02T00:00:00.000Z',
        from: { address: 'a@b.com', name: '' },
        hasAttachments: false,
        id: 'boundary',
        seen: false,
        subject: 'Boundary',
        to: []
      };
      const newerMessage = {
        createdAt: '2026-01-03T00:00:00.000Z',
        from: { address: 'a@b.com', name: '' },
        hasAttachments: false,
        id: 'newer',
        seen: false,
        subject: 'Newer',
        to: []
      };
      const emailProvider = createMockEmailProvider({
        getMessages: vi.fn(async () => {
          await noopAsync();
          return [olderMessage, boundaryMessage, newerMessage];
        })
      });
      const { pluginSettingsComponent } = createMockPluginSettingsComponent({
        lastProcessedEmailTimestamp: '2026-01-02T00:00:00.000Z',
        shouldMarkEmailsAsSeen: false
      });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });

      await checker.checkEmails();

      expect(noteCreator.saveEmailAsNote).toHaveBeenCalledTimes(1);
      expect(noteCreator.saveEmailAsNote).toHaveBeenCalledWith(newerMessage);
      expect(pluginSettingsComponent.settings.lastProcessedEmailTimestamp).toBe('2026-01-03T00:00:00.000Z');
    });

    it('should fall back to unseen selection on first run in timestamp mode and initialize the bookmark', async () => {
      const seenMessage = {
        createdAt: '2026-01-05T00:00:00.000Z',
        from: { address: 'a@b.com', name: '' },
        hasAttachments: false,
        id: 'seen',
        seen: true,
        subject: 'Already read',
        to: []
      };
      const unseenMessage = {
        createdAt: '2026-01-04T00:00:00.000Z',
        from: { address: 'a@b.com', name: '' },
        hasAttachments: false,
        id: 'unseen',
        seen: false,
        subject: 'Unread',
        to: []
      };
      const emailProvider = createMockEmailProvider({
        getMessages: vi.fn(async () => {
          await noopAsync();
          return [seenMessage, unseenMessage];
        })
      });
      const { pluginSettingsComponent } = createMockPluginSettingsComponent({
        lastProcessedEmailTimestamp: '',
        shouldMarkEmailsAsSeen: false
      });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });

      await checker.checkEmails();

      expect(noteCreator.saveEmailAsNote).toHaveBeenCalledTimes(1);
      expect(noteCreator.saveEmailAsNote).toHaveBeenCalledWith(unseenMessage);
      expect(pluginSettingsComponent.settings.lastProcessedEmailTimestamp).toBe('2026-01-05T00:00:00.000Z');
    });

    it('should initialize the bookmark even when there are no unseen messages on first run', async () => {
      const emailProvider = createMockEmailProvider({
        getMessages: vi.fn(async () => {
          await noopAsync();
          return [
            {
              createdAt: '2026-01-06T00:00:00.000Z',
              from: { address: 'a@b.com', name: '' },
              hasAttachments: false,
              id: 'seen',
              seen: true,
              subject: 'Already read',
              to: []
            }
          ];
        })
      });
      const { pluginSettingsComponent } = createMockPluginSettingsComponent({
        lastProcessedEmailTimestamp: '',
        shouldMarkEmailsAsSeen: false
      });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });

      await checker.checkEmails();

      expect(noteCreator.saveEmailAsNote).not.toHaveBeenCalled();
      expect(mockShowNotice).toHaveBeenCalledWith('No new emails');
      expect(pluginSettingsComponent.settings.lastProcessedEmailTimestamp).toBe('2026-01-06T00:00:00.000Z');
    });

    it('should not persist the bookmark when no message is newer in timestamp mode', async () => {
      const emailProvider = createMockEmailProvider({
        getMessages: vi.fn(async () => {
          await noopAsync();
          return [
            {
              createdAt: '2026-01-01T00:00:00.000Z',
              from: { address: 'a@b.com', name: '' },
              hasAttachments: false,
              id: 'old',
              seen: false,
              subject: 'Old',
              to: []
            }
          ];
        })
      });
      const { pluginSettingsComponent } = createMockPluginSettingsComponent({
        lastProcessedEmailTimestamp: '2026-01-01T00:00:00.000Z',
        shouldMarkEmailsAsSeen: false
      });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });

      await checker.checkEmails();

      expect(noteCreator.saveEmailAsNote).not.toHaveBeenCalled();
      expect(pluginSettingsComponent.editAndSave).not.toHaveBeenCalled();
      expect(mockShowNotice).toHaveBeenCalledWith('No new emails');
    });

    it('should delete without marking as seen when both delete and mark-as-seen are configured accordingly', async () => {
      const emailProvider = createMockEmailProvider({
        getMessages: vi.fn(async () => {
          await noopAsync();
          return [
            {
              createdAt: '2026-01-01T00:00:00.000Z',
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
      const { pluginSettingsComponent } = createMockPluginSettingsComponent({
        shouldDeleteSeenEmails: true,
        shouldMarkEmailsAsSeen: false
      });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });

      await checker.checkEmails();

      expect(emailProvider.deleteMessage).toHaveBeenCalledWith('msg1');
      expect(emailProvider.markMessageAsSeen).not.toHaveBeenCalled();
      expect(pluginSettingsComponent.editAndSave).not.toHaveBeenCalled();
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
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });

      await checker.redownloadEmails();

      expect(noteCreator.saveEmailAsNote).toHaveBeenCalledTimes(2);
      expect(mockShowNotice).toHaveBeenCalledWith('Redownloaded 2 email(s)');
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
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });

      await checker.redownloadEmails(1);

      expect(noteCreator.saveEmailAsNote).toHaveBeenCalledTimes(1);
      expect(mockShowNotice).toHaveBeenCalledWith('Redownloaded 1 email(s)');
    });
  });

  describe('authentication errors', () => {
    function createChecker(getMessages: EmailProvider['getMessages']): EmailCheckerComponent {
      const { pluginSettingsComponent } = createMockPluginSettingsComponent();
      return new EmailCheckerComponent({
        emailNoteCreator: createMockNoteCreator(),
        emailProvider: createMockEmailProvider({ getMessages }),
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });
    }

    async function rejectWithAuthenticationError(): Promise<never> {
      await noopAsync();
      throw new EmailProviderAuthenticationError('Paste the right password');
    }

    async function rejectWithOtherError(): Promise<never> {
      await noopAsync();
      throw new Error('Network down');
    }

    it('should show the message as a notice when checking emails', async () => {
      await expect(createChecker(rejectWithAuthenticationError).checkEmails()).resolves.toBeUndefined();
      expect(mockShowNotice).toHaveBeenLastCalledWith('Paste the right password');
    });

    it('should show the message as a notice when downloading emails again', async () => {
      await expect(createChecker(rejectWithAuthenticationError).redownloadEmails()).resolves.toBeUndefined();
      expect(mockShowNotice).toHaveBeenLastCalledWith('Paste the right password');
    });

    it('should rethrow any other error', async () => {
      await expect(createChecker(rejectWithOtherError).checkEmails()).rejects.toThrow('Network down');
      await expect(createChecker(rejectWithOtherError).redownloadEmails()).rejects.toThrow('Network down');
    });
  });
  describe('transient network errors', () => {
    const MANUAL_FAILURE_NOTICE = 'Could not reach the Mail.tm server (net::ERR_CONNECTION_CLOSED). Check your internet connection and try again.';

    async function flushPromises(): Promise<void> {
      await setImmediate();
    }

    async function rejectWithConnectionClosed(): Promise<never> {
      await noopAsync();
      throw new Error('net::ERR_CONNECTION_CLOSED');
    }

    interface ScheduledChecker {
      readonly checker: EmailCheckerComponent;
      readonly getMessages: ReturnType<typeof vi.fn<EmailProvider['getMessages']>>;
      readonly tick: () => Promise<void>;
    }

    function createScheduledChecker(emailProviderType = EmailProviderType.MailTm): ScheduledChecker {
      let tickCallback: (() => void) | null = null;
      vi.stubGlobal('window', {
        clearInterval: vi.fn(),
        setInterval: vi.fn((callback: () => void) => {
          tickCallback = callback;
          return 1;
        })
      });

      const getMessages = vi.fn<EmailProvider['getMessages']>(rejectWithConnectionClosed);
      const { pluginSettingsComponent } = createMockPluginSettingsComponent({ emailProviderType });
      const checker = new EmailCheckerComponent({
        emailNoteCreator: createMockNoteCreator(),
        emailProvider: createMockEmailProvider({ getMessages }),
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });
      checker.load();

      return {
        checker,
        getMessages,
        async tick(): Promise<void> {
          if (!tickCallback) {
            throw new Error('No interval was scheduled');
          }
          tickCallback();
          await flushPromises();
        }
      };
    }

    function getFailureNotices(): unknown[] {
      return mockShowNotice.mock.calls.map((call: unknown[]) => call[0]).filter((message) => message !== 'Checking emails...');
    }

    it('should not report an unhandled error when a scheduled check hits a dropped connection', async () => {
      const asyncErrors: unknown[] = [];
      using _handler = registerAsyncErrorEventHandler((asyncError) => {
        asyncErrors.push(asyncError);
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const { tick } = createScheduledChecker();

      await tick();

      expect(asyncErrors).toEqual([]);
      expect(getFailureNotices()).toEqual([]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain('Mail.tm server (net::ERR_CONNECTION_CLOSED)');
    });

    it('should run the next tick normally once the connection is back', async () => {
      vi.spyOn(console, 'warn').mockImplementation(noop);
      const { getMessages, tick } = createScheduledChecker();

      await tick();
      getMessages.mockImplementation(async () => {
        await noopAsync();
        return [];
      });
      await tick();

      expect(getMessages).toHaveBeenCalledTimes(2);
      expect(mockShowNotice).toHaveBeenLastCalledWith('No new emails');
    });

    it('should back off when scheduled checks keep failing, and warn once per run of failures', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const { getMessages, tick } = createScheduledChecker();

      const TICKS = 20;
      for (let index = 0; index < TICKS; index++) {
        await tick();
      }

      // Checks at ticks 1, 2, 4, 8, 16 (backoff 1, 2, 4, 8 intervals), then every 8th tick.
      const EXPECTED_CHECKS = 5;
      expect(getMessages).toHaveBeenCalledTimes(EXPECTED_CHECKS);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('should reset the backoff after a successful check', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const { getMessages, tick } = createScheduledChecker();

      // Failures at ticks 1 and 2, then tick 3 is skipped.
      await tick();
      await tick();
      await tick();
      expect(getMessages).toHaveBeenCalledTimes(2);

      getMessages.mockImplementation(async () => {
        await noopAsync();
        return [];
      });
      await tick();
      expect(getMessages).toHaveBeenCalledTimes(3);

      getMessages.mockImplementation(rejectWithConnectionClosed);
      await tick();
      await tick();
      expect(getMessages).toHaveBeenCalledTimes(5);
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it('should name the IMAP server when the IMAP provider is active', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const { tick } = createScheduledChecker(EmailProviderType.Imap);

      await tick();

      expect(warnSpy.mock.calls[0]?.[0]).toContain('IMAP server (net::ERR_CONNECTION_CLOSED)');
    });

    it('should still show an authentication error raised by a scheduled check', async () => {
      const { getMessages, tick } = createScheduledChecker();
      getMessages.mockImplementation(async () => {
        await noopAsync();
        throw new EmailProviderAuthenticationError('Paste the right password');
      });

      await tick();

      expect(mockShowNotice).toHaveBeenLastCalledWith('Paste the right password');
    });

    it('should still report any other error raised by a scheduled check', async () => {
      const asyncErrors: unknown[] = [];
      using _handler = registerAsyncErrorEventHandler((asyncError) => {
        asyncErrors.push(asyncError);
      });
      using _ignore = startAsyncErrorIgnoreContext();
      const { getMessages, tick } = createScheduledChecker();
      getMessages.mockImplementation(async () => {
        await noopAsync();
        throw new Error('Unexpected response');
      });

      await tick();

      expect(asyncErrors).toHaveLength(1);
    });

    it('should tell the user when a manual check hits a dropped connection', async () => {
      const { checker } = createScheduledChecker();

      await expect(checker.checkEmails()).resolves.toBeUndefined();

      expect(mockShowNotice).toHaveBeenLastCalledWith(MANUAL_FAILURE_NOTICE);
    });

    it('should tell the user when downloading emails again hits a dropped connection', async () => {
      const { checker } = createScheduledChecker();

      await expect(checker.redownloadEmails()).resolves.toBeUndefined();

      expect(mockShowNotice).toHaveBeenLastCalledWith(MANUAL_FAILURE_NOTICE);
    });
  });

  describe('rate limits', () => {
    const RATE_LIMIT_NOTICE_PREFIX = 'The Mail.tm server refused the request because it was asked too often (HTTP 429).';
    const SECONDS_PER_MINUTE = 60;
    const MILLISECONDS_PER_SECOND = 1000;

    function rejectWithRateLimit(retryAfterInMilliseconds: null | number): EmailProvider['getMessages'] {
      return async () => {
        await noopAsync();
        throw new EmailProviderRateLimitError('Mail.tm is limiting requests from this device (HTTP 429)', retryAfterInMilliseconds);
      };
    }

    interface ScheduledChecker {
      readonly checker: EmailCheckerComponent;
      readonly getMessages: ReturnType<typeof vi.fn<EmailProvider['getMessages']>>;
      readonly tick: () => Promise<void>;
    }

    function createScheduledChecker(retryAfterInMilliseconds: null | number): ScheduledChecker {
      let tickCallback: (() => void) | null = null;
      vi.stubGlobal('window', {
        clearInterval: vi.fn(),
        setInterval: vi.fn((callback: () => void) => {
          tickCallback = callback;
          return 1;
        })
      });

      const getMessages = vi.fn<EmailProvider['getMessages']>(rejectWithRateLimit(retryAfterInMilliseconds));
      const { pluginSettingsComponent } = createMockPluginSettingsComponent();
      const checker = new EmailCheckerComponent({
        emailNoteCreator: createMockNoteCreator(),
        emailProvider: createMockEmailProvider({ getMessages }),
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });
      checker.load();

      return {
        checker,
        getMessages,
        async tick(): Promise<void> {
          if (!tickCallback) {
            throw new Error('No interval was scheduled');
          }
          tickCallback();
          await setImmediate();
        }
      };
    }

    it('should skip a scheduled check that hits the rate limit without an unhandled error or a notice', async () => {
      const asyncErrors: unknown[] = [];
      using _handler = registerAsyncErrorEventHandler((asyncError) => {
        asyncErrors.push(asyncError);
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(noop);
      const { tick } = createScheduledChecker(null);

      await tick();

      expect(asyncErrors).toEqual([]);
      expect(mockShowNotice.mock.calls.map((call: unknown[]) => call[0])).toEqual(['Checking emails...']);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain('was refused by the Mail.tm server for asking too often (HTTP 429)');
    });

    it('should back off like a dropped connection when the server gives no Retry-After', async () => {
      vi.spyOn(console, 'warn').mockImplementation(noop);
      const { getMessages, tick } = createScheduledChecker(null);

      // Failures at ticks 1 and 2, tick 3 skipped, failure at tick 4.
      const TICKS = 4;
      for (let index = 0; index < TICKS; index++) {
        await tick();
      }

      const EXPECTED_CHECKS = 3;
      expect(getMessages).toHaveBeenCalledTimes(EXPECTED_CHECKS);
    });

    it('should wait out a Retry-After longer than the backoff', async () => {
      vi.spyOn(console, 'warn').mockImplementation(noop);
      // 25 minutes against the 10-minute interval: the next check is three intervals later, at tick 4.
      const RETRY_AFTER_IN_MINUTES = 25;
      const { getMessages, tick } = createScheduledChecker(RETRY_AFTER_IN_MINUTES * SECONDS_PER_MINUTE * MILLISECONDS_PER_SECOND);

      await tick();
      await tick();
      await tick();
      expect(getMessages).toHaveBeenCalledTimes(1);

      await tick();
      const EXPECTED_CHECKS = 2;
      expect(getMessages).toHaveBeenCalledTimes(EXPECTED_CHECKS);
    });

    it.each([
      { expected: 'Try again in 30 seconds.', retryAfterInMilliseconds: 29_001 },
      { expected: 'Try again in 1 second.', retryAfterInMilliseconds: 1000 },
      { expected: 'Try again in a moment.', retryAfterInMilliseconds: 0 },
      { expected: 'Try again in a moment.', retryAfterInMilliseconds: null }
    ])('should tell the user when a manual check hits the rate limit ($retryAfterInMilliseconds ms)', async ({ expected, retryAfterInMilliseconds }) => {
      const { checker } = createScheduledChecker(retryAfterInMilliseconds);

      await expect(checker.checkEmails()).resolves.toBeUndefined();

      expect(mockShowNotice).toHaveBeenLastCalledWith(`${RATE_LIMIT_NOTICE_PREFIX} ${expected}`);
    });

    it('should tell the user when downloading emails again hits the rate limit', async () => {
      const { checker } = createScheduledChecker(null);

      await expect(checker.redownloadEmails()).resolves.toBeUndefined();

      expect(mockShowNotice).toHaveBeenLastCalledWith(`${RATE_LIMIT_NOTICE_PREFIX} Try again in a moment.`);
    });
  });

  describe('onload', () => {
    it('should not schedule when interval is 0', () => {
      const emailProvider = createMockEmailProvider();
      const { pluginSettingsComponent } = createMockPluginSettingsComponent({ emailCheckIntervalInMinutes: 0 });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
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
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
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
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });

      checker.load();

      expect(pluginSettingsComponent.on).toHaveBeenCalledWith('saveSettings', expect.any(Function));
    });

    it('should reschedule when emailCheckIntervalInMinutes changes', async () => {
      const mockClearInterval = vi.fn();
      const mockSetInterval = vi.fn(() => 1);
      vi.stubGlobal('window', {
        clearInterval: mockClearInterval,
        setInterval: mockSetInterval
      });

      const emailProvider = createMockEmailProvider();
      const { pluginSettingsComponent, triggerSaveSettings } = createMockPluginSettingsComponent({ emailCheckIntervalInMinutes: 5 });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });

      checker.load();
      mockSetInterval.mockClear();

      const oldState = createSettingsState(5);
      const newState = createSettingsState(15);
      await triggerSaveSettings(newState, oldState);

      expect(mockClearInterval).toHaveBeenCalled();
      expect(mockSetInterval).toHaveBeenCalled();
    });

    it('should not reschedule when emailCheckIntervalInMinutes does not change', async () => {
      const mockSetInterval = vi.fn(() => 1);
      vi.stubGlobal('window', {
        clearInterval: vi.fn(),
        setInterval: mockSetInterval
      });

      const emailProvider = createMockEmailProvider();
      const { pluginSettingsComponent, triggerSaveSettings } = createMockPluginSettingsComponent({ emailCheckIntervalInMinutes: 5 });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });

      checker.load();
      mockSetInterval.mockClear();

      const state = createSettingsState(5);
      await triggerSaveSettings(state, state);

      expect(mockSetInterval).not.toHaveBeenCalled();
    });

    it('should clear previous interval before scheduling new one', async () => {
      const mockClearInterval = vi.fn();
      vi.stubGlobal('window', {
        clearInterval: mockClearInterval,
        setInterval: vi.fn(() => 1)
      });

      const emailProvider = createMockEmailProvider();
      const { pluginSettingsComponent, triggerSaveSettings } = createMockPluginSettingsComponent({ emailCheckIntervalInMinutes: 5 });
      const noteCreator = createMockNoteCreator();
      const checker = new EmailCheckerComponent({
        emailNoteCreator: noteCreator,
        emailProvider,
        pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice: mockShowNotice }),
        pluginSettingsComponent
      });

      checker.load();

      const oldState = createSettingsState(5);
      const newState = createSettingsState(10);
      await triggerSaveSettings(newState, oldState);

      expect(mockClearInterval).toHaveBeenCalled();
    });
  });
});
