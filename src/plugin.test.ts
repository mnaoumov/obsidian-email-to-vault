import type {
  App,
  PluginManifest
} from 'obsidian';

import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { CheckEmailsCommandHandler } from './command-handlers/check-emails-command-handler.ts';
import { RedownloadAllEmailsCommandHandler } from './command-handlers/redownload-all-emails-command-handler.ts';
import { RedownloadRecentEmailsCommandHandler } from './command-handlers/redownload-recent-emails-command-handler.ts';
import { EmailChecker } from './email-checker.ts';
import { EmailNoteCreator } from './email-note-creator.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { Plugin } from './plugin.ts';
import { PrismComponent } from './prism-component.ts';
import { EmailProviderManager } from './providers/email-provider-manager.ts';
import { MailTmDomainManager } from './providers/mail-tm/mail-tm-domain-manager.ts';

const mocks = vi.hoisted(() => ({
  mockAddChild: vi.fn(<T>(child: T): T => child)
}));

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin', () => ({
  PluginBase: class MockPluginBase {
    public addChild = mocks.mockAddChild;
    public app: unknown;
    public manifest: unknown;
    public constructor(app: unknown, manifest: unknown) {
      this.app = app;
      this.manifest = manifest;
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/command-handlers/command-handler-component', () => ({
  CommandHandlerComponent: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/plugin/components/plugin-settings-tab-component', () => ({
  PluginSettingsTabComponent: vi.fn()
}));

vi.mock('./prism-component.ts', () => ({
  PrismComponent: vi.fn()
}));

vi.mock('./providers/mail-tm/mail-tm-domain-manager.ts', () => ({
  MailTmDomainManager: vi.fn()
}));

vi.mock('./plugin-settings-component.ts', () => ({
  PluginSettingsComponent: vi.fn()
}));

vi.mock('./providers/email-provider-manager.ts', () => ({
  EmailProviderManager: vi.fn()
}));

vi.mock('./email-checker.ts', () => ({
  EmailChecker: vi.fn()
}));

vi.mock('./email-note-creator.ts', () => ({
  EmailNoteCreator: vi.fn()
}));

vi.mock('./command-handlers/check-emails-command-handler.ts', () => ({
  CheckEmailsCommandHandler: vi.fn()
}));

vi.mock('./command-handlers/redownload-all-emails-command-handler.ts', () => ({
  RedownloadAllEmailsCommandHandler: vi.fn()
}));

vi.mock('./command-handlers/redownload-recent-emails-command-handler.ts', () => ({
  RedownloadRecentEmailsCommandHandler: vi.fn()
}));

vi.mock('./plugin-settings-tab.ts', () => ({
  PluginSettingsTab: vi.fn()
}));

const MockCheckEmailsCommandHandler = vi.mocked(CheckEmailsCommandHandler);
const MockEmailChecker = vi.mocked(EmailChecker);
const MockEmailNoteCreator = vi.mocked(EmailNoteCreator);
const MockMailTmDomainManager = vi.mocked(MailTmDomainManager);
const MockEmailProviderManager = vi.mocked(EmailProviderManager);
const MockPluginSettingsComponent = vi.mocked(PluginSettingsComponent);
const MockPluginSettingsTab = vi.mocked(PluginSettingsTab);
const MockPrismComponent = vi.mocked(PrismComponent);
const MockRedownloadAllEmailsCommandHandler = vi.mocked(RedownloadAllEmailsCommandHandler);
const MockRedownloadRecentEmailsCommandHandler = vi.mocked(RedownloadRecentEmailsCommandHandler);

describe('Plugin', () => {
  const mockApp = strictProxy<App>({});
  const mockManifest = strictProxy<PluginManifest>({
    id: 'email-to-vault',
    name: 'Email to Vault'
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create MailTmDomainManager', () => {
      new Plugin(mockApp, mockManifest);

      expect(MockMailTmDomainManager).toHaveBeenCalledOnce();
    });

    it('should create PluginSettingsComponent with plugin, manifest id, and domain manager', () => {
      const plugin = new Plugin(mockApp, mockManifest);

      expect(MockPluginSettingsComponent).toHaveBeenCalledWith(
        plugin,
        'email-to-vault',
        MockMailTmDomainManager.mock.instances[0]
      );
    });

    it('should create EmailProviderManager with app, manifest id, settings component, and domain manager', () => {
      new Plugin(mockApp, mockManifest);

      expect(MockEmailProviderManager).toHaveBeenCalledWith(
        mockApp,
        'email-to-vault',
        MockPluginSettingsComponent.mock.instances[0],
        MockMailTmDomainManager.mock.instances[0]
      );
    });

    it('should create EmailNoteCreator with plugin, settings component, and provider manager', () => {
      const plugin = new Plugin(mockApp, mockManifest);

      expect(MockEmailNoteCreator).toHaveBeenCalledWith(
        plugin,
        MockPluginSettingsComponent.mock.instances[0],
        MockEmailProviderManager.mock.instances[0]
      );
    });

    it('should create EmailChecker with settings component, provider manager, and note creator', () => {
      new Plugin(mockApp, mockManifest);

      expect(MockEmailChecker).toHaveBeenCalledWith(
        MockPluginSettingsComponent.mock.instances[0],
        MockEmailProviderManager.mock.instances[0],
        MockEmailNoteCreator.mock.instances[0]
      );
    });

    it('should create PluginSettingsTab with plugin, settings component, provider manager, and manifest id', () => {
      const plugin = new Plugin(mockApp, mockManifest);

      expect(MockPluginSettingsTab).toHaveBeenCalledWith({
        emailProviderManager: MockEmailProviderManager.mock.instances[0],
        plugin,
        pluginId: 'email-to-vault',
        pluginSettingsComponent: MockPluginSettingsComponent.mock.instances[0]
      });
    });

    it('should create PrismComponent', () => {
      new Plugin(mockApp, mockManifest);

      expect(MockPrismComponent).toHaveBeenCalledOnce();
    });

    it('should create CheckEmailsCommandHandler with manifest name and email checker', () => {
      new Plugin(mockApp, mockManifest);

      expect(MockCheckEmailsCommandHandler).toHaveBeenCalledWith(
        'Email to Vault',
        MockEmailChecker.mock.instances[0]
      );
    });

    it('should create RedownloadAllEmailsCommandHandler with manifest name and email checker', () => {
      new Plugin(mockApp, mockManifest);

      expect(MockRedownloadAllEmailsCommandHandler).toHaveBeenCalledWith(
        'Email to Vault',
        MockEmailChecker.mock.instances[0]
      );
    });

    it('should create RedownloadRecentEmailsCommandHandler with app, manifest name, and email checker', () => {
      new Plugin(mockApp, mockManifest);

      expect(MockRedownloadRecentEmailsCommandHandler).toHaveBeenCalledWith(
        mockApp,
        'Email to Vault',
        MockEmailChecker.mock.instances[0]
      );
    });

    it('should add MailTmDomainManager as child', () => {
      new Plugin(mockApp, mockManifest);

      expect(mocks.mockAddChild).toHaveBeenCalledWith(MockMailTmDomainManager.mock.instances[0]);
    });

    it('should add PluginSettingsComponent as child', () => {
      new Plugin(mockApp, mockManifest);

      expect(mocks.mockAddChild).toHaveBeenCalledWith(MockPluginSettingsComponent.mock.instances[0]);
    });

    it('should add EmailProviderManager as child', () => {
      new Plugin(mockApp, mockManifest);

      expect(mocks.mockAddChild).toHaveBeenCalledWith(MockEmailProviderManager.mock.instances[0]);
    });

    it('should add EmailChecker as child', () => {
      new Plugin(mockApp, mockManifest);

      expect(mocks.mockAddChild).toHaveBeenCalledWith(MockEmailChecker.mock.instances[0]);
    });

    it('should add all children', () => {
      new Plugin(mockApp, mockManifest);

      const EXPECTED_ADD_CHILD_CALLS = 9;
      expect(mocks.mockAddChild).toHaveBeenCalledTimes(EXPECTED_ADD_CHILD_CALLS);
    });
  });
});
