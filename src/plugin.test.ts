import type {
  App,
  PluginManifest
} from 'obsidian';

import { noop } from 'obsidian-dev-utils/function';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { CheckEmailsCommand } from './commands/check-emails-command.ts';
import { OpenSettingsCommand } from './commands/open-settings-command.ts';
import { RedownloadAllEmailsCommand } from './commands/redownload-all-emails-command.ts';
import { RedownloadRecentEmailsCommand } from './commands/redownload-recent-emails-command.ts';
import { EmailChecker } from './email-checker.ts';
import { EmailNoteCreator } from './email-note-creator.ts';
import { MailTmManager } from './mail-tm-manager.ts';
import { PluginSettingsManager } from './plugin-settings-manager.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { Plugin } from './plugin.ts';

const mocks = vi.hoisted(() => ({
  mockCheckEmailsRegister: vi.fn(),
  mockOpenSettingsRegister: vi.fn(),
  mockRedownloadAllEmailsRegister: vi.fn(),
  mockRedownloadRecentEmailsRegister: vi.fn(),
  mockScheduleCheckEmails: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin-base', () => ({
  PluginBase: class MockPluginBase {
    public app: unknown;
    public manifest: unknown;
    public constructor(app: unknown, manifest: unknown) {
      this.app = app;
      this.manifest = manifest;
    }

    public addChild(): void {
      noop();
    }

    protected async onloadImpl(): Promise<void> {
      await Promise.resolve();
    }

    protected async onSaveSettings(): Promise<void> {
      await Promise.resolve();
    }
  }
}));

vi.mock('./prism-component.ts', () => ({
  PrismComponent: vi.fn()
}));

vi.mock('./mail-tm-manager.ts', () => ({
  MailTmManager: vi.fn()
}));

vi.mock('./email-checker.ts', () => ({
  EmailChecker: vi.fn(function emailCheckerMock(this: Record<string, unknown>) {
    this['scheduleCheckEmails'] = mocks.mockScheduleCheckEmails;
  })
}));

vi.mock('./email-note-creator.ts', () => ({
  EmailNoteCreator: vi.fn()
}));

vi.mock('./commands/open-settings-command.ts', () => ({
  OpenSettingsCommand: vi.fn(function openSettingsCommandMock(this: Record<string, unknown>) {
    this['register'] = mocks.mockOpenSettingsRegister;
  })
}));

vi.mock('./commands/check-emails-command.ts', () => ({
  CheckEmailsCommand: vi.fn(function checkEmailsCommandMock(this: Record<string, unknown>) {
    this['register'] = mocks.mockCheckEmailsRegister;
  })
}));

vi.mock('./commands/redownload-all-emails-command.ts', () => ({
  RedownloadAllEmailsCommand: vi.fn(function redownloadAllEmailsCommandMock(this: Record<string, unknown>) {
    this['register'] = mocks.mockRedownloadAllEmailsRegister;
  })
}));

vi.mock('./commands/redownload-recent-emails-command.ts', () => ({
  RedownloadRecentEmailsCommand: vi.fn(function redownloadRecentEmailsCommandMock(this: Record<string, unknown>) {
    this['register'] = mocks.mockRedownloadRecentEmailsRegister;
  })
}));

vi.mock('./plugin-settings-manager.ts', () => ({
  PluginSettingsManager: vi.fn()
}));

vi.mock('./plugin-settings-tab.ts', () => ({
  PluginSettingsTab: vi.fn()
}));

const MockCheckEmailsCommand = vi.mocked(CheckEmailsCommand);
const MockEmailChecker = vi.mocked(EmailChecker);
const MockEmailNoteCreator = vi.mocked(EmailNoteCreator);
const MockMailTmManager = vi.mocked(MailTmManager);
const MockOpenSettingsCommand = vi.mocked(OpenSettingsCommand);
const MockPluginSettingsManager = vi.mocked(PluginSettingsManager);
const MockPluginSettingsTab = vi.mocked(PluginSettingsTab);
const MockRedownloadAllEmailsCommand = vi.mocked(RedownloadAllEmailsCommand);
const MockRedownloadRecentEmailsCommand = vi.mocked(RedownloadRecentEmailsCommand);

const BASE_SETTINGS = {
  emailAddress: '',
  emailCheckIntervalInMinutes: 10,
  emailNotePathTemplate: '',
  emailNoteTemplate: '',
  emailPasswordSecretKey: '',
  shouldDeleteSeenEmails: false,
  shouldExtractForwardedEmail: false
};

const BASE_VALIDATION_MESSAGES = {
  emailAddress: '',
  emailCheckIntervalInMinutes: '',
  emailNotePathTemplate: '',
  emailNoteTemplate: '',
  emailPasswordSecretKey: '',
  shouldDeleteSeenEmails: '',
  shouldExtractForwardedEmail: ''
};

interface SettingsWrapper {
  safeSettings: typeof BASE_SETTINGS;
  settings: typeof BASE_SETTINGS;
  validationMessages: typeof BASE_VALIDATION_MESSAGES;
}

function createSettingsWrapper(overrides?: Partial<typeof BASE_SETTINGS>): SettingsWrapper {
  const settings = { ...BASE_SETTINGS, ...overrides };
  return {
    safeSettings: settings,
    settings,
    validationMessages: BASE_VALIDATION_MESSAGES
  };
}

describe('Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create MailTmManager with plugin reference', () => {
      const plugin = new Plugin(strictProxy<App>({}), strictProxy<PluginManifest>({}));

      expect(MockMailTmManager).toHaveBeenCalledWith(plugin);
    });

    it('should create EmailNoteCreator with plugin and mail manager', () => {
      const plugin = new Plugin(strictProxy<App>({}), strictProxy<PluginManifest>({}));

      expect(MockEmailNoteCreator).toHaveBeenCalledWith(plugin, MockMailTmManager.mock.instances[0]);
    });

    it('should create EmailChecker with plugin, mail manager, and note creator', () => {
      const plugin = new Plugin(strictProxy<App>({}), strictProxy<PluginManifest>({}));

      expect(MockEmailChecker).toHaveBeenCalledWith(plugin, MockMailTmManager.mock.instances[0], MockEmailNoteCreator.mock.instances[0]);
    });
  });

  describe('createSettingsManager', () => {
    it('should return PluginSettingsManager with correct dependencies', () => {
      const plugin = new Plugin(strictProxy<App>({}), strictProxy<PluginManifest>({}));

      const result = plugin['createSettingsManager']();

      expect(MockPluginSettingsManager).toHaveBeenCalledWith(plugin, MockMailTmManager.mock.instances[0]);
      expect(result).toBe(MockPluginSettingsManager.mock.instances[0]);
    });
  });

  describe('createSettingsTab', () => {
    it('should return PluginSettingsTab with correct dependencies', () => {
      const plugin = new Plugin(strictProxy<App>({}), strictProxy<PluginManifest>({}));

      const result = plugin['createSettingsTab']();

      expect(MockPluginSettingsTab).toHaveBeenCalledWith(plugin, MockMailTmManager.mock.instances[0]);
      expect(result).toBe(MockPluginSettingsTab.mock.instances[0]);
    });
  });

  describe('onloadImpl', () => {
    it('should register OpenSettingsCommand', async () => {
      const plugin = new Plugin(strictProxy<App>({}), strictProxy<PluginManifest>({}));

      await plugin['onloadImpl']();

      expect(MockOpenSettingsCommand).toHaveBeenCalledWith(plugin);
      expect(mocks.mockOpenSettingsRegister).toHaveBeenCalledOnce();
    });

    it('should register CheckEmailsCommand with email checker', async () => {
      const plugin = new Plugin(strictProxy<App>({}), strictProxy<PluginManifest>({}));

      await plugin['onloadImpl']();

      expect(MockCheckEmailsCommand).toHaveBeenCalledWith(plugin, MockEmailChecker.mock.instances[0]);
      expect(mocks.mockCheckEmailsRegister).toHaveBeenCalledOnce();
    });

    it('should register RedownloadAllEmailsCommand with email checker', async () => {
      const plugin = new Plugin(strictProxy<App>({}), strictProxy<PluginManifest>({}));

      await plugin['onloadImpl']();

      expect(MockRedownloadAllEmailsCommand).toHaveBeenCalledWith(plugin, MockEmailChecker.mock.instances[0]);
      expect(mocks.mockRedownloadAllEmailsRegister).toHaveBeenCalledOnce();
    });

    it('should register RedownloadRecentEmailsCommand with email checker', async () => {
      const plugin = new Plugin(strictProxy<App>({}), strictProxy<PluginManifest>({}));

      await plugin['onloadImpl']();

      expect(MockRedownloadRecentEmailsCommand).toHaveBeenCalledWith(plugin, MockEmailChecker.mock.instances[0]);
      expect(mocks.mockRedownloadRecentEmailsRegister).toHaveBeenCalledOnce();
    });

    it('should schedule email checking', async () => {
      const plugin = new Plugin(strictProxy<App>({}), strictProxy<PluginManifest>({}));

      await plugin['onloadImpl']();

      expect(mocks.mockScheduleCheckEmails).toHaveBeenCalledOnce();
    });
  });

  describe('onSaveSettings', () => {
    it('should reschedule when email check interval changes', async () => {
      const plugin = new Plugin(strictProxy<App>({}), strictProxy<PluginManifest>({}));

      await plugin['onSaveSettings'](
        createSettingsWrapper({ emailCheckIntervalInMinutes: 5 }),
        createSettingsWrapper(),
        undefined
      );

      expect(mocks.mockScheduleCheckEmails).toHaveBeenCalledOnce();
    });

    it('should not reschedule when interval stays the same', async () => {
      const plugin = new Plugin(strictProxy<App>({}), strictProxy<PluginManifest>({}));

      await plugin['onSaveSettings'](
        createSettingsWrapper(),
        createSettingsWrapper(),
        undefined
      );

      expect(mocks.mockScheduleCheckEmails).not.toHaveBeenCalled();
    });
  });
});
