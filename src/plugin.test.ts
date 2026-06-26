import type {
  App as AppOriginal,
  PluginManifest
} from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { PluginDataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import { PluginEventSourceImpl } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';
import { App } from 'obsidian-test-mocks/obsidian';
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
import { EmailCheckerComponent } from './email-checker.ts';
import { EmailNoteCreator } from './email-note-creator.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { PluginSettings } from './plugin-settings.ts';
import { Plugin } from './plugin.ts';
import { PrismComponent } from './prism-component.ts';
import { EmailProviderManagerComponent } from './providers/email-provider-manager.ts';
import { MailTmDomainManager } from './providers/mail-tm/mail-tm-domain-manager.ts';

// The real `PluginBase.onload()` loads dev-utils' own notice/context/debug components, which read a
// Shared-state bag off the app via `getObsidianDevUtilsState`. The strict App mock has no such bag, so
// Stub this one utility (return a fresh value wrapper per call) — mirroring dev-utils' own PluginBase test.
vi.mock('obsidian-dev-utils/obsidian/app', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/obsidian/app')>(),
  getObsidianDevUtilsState: vi.fn((_app: unknown, _key: string, defaultValue: unknown) => ({ value: defaultValue }))
}));

// A dev-utils/own component that is added via `addChild` must be loadable, so its stub returns a
// Real `Component`. The flowing instance is the stub's return value (`mock.results[0].value`),
// Not the discarded `this` (`mock.instances[0]`).
interface ObsidianComponentModule {
  Component: new () => object;
}

async function loadableComponentStub(): Promise<ReturnType<typeof vi.fn>> {
  const { Component } = await vi.importActual<ObsidianComponentModule>('obsidian');
  // Vitest requires a non-arrow function for a mock invoked with `new`; it must return a fresh real
  // `Component`. Constructing a stub class directly would route `this` through vitest's mock proxy and
  // Break the test-mocks `Component` constructor's own strict proxy.
  // eslint-disable-next-line prefer-arrow-callback -- See above; an arrow cannot be used here.
  return vi.fn(function componentStub() {
    return new Component();
  });
}

vi.mock('obsidian-dev-utils/obsidian/command-handlers/command-handler-component', async () => ({
  CommandHandlerComponent: await loadableComponentStub()
}));

vi.mock('obsidian-dev-utils/obsidian/components/menu-event-registrar-component', async () => ({
  MenuEventRegistrarComponent: await loadableComponentStub()
}));

vi.mock('obsidian-dev-utils/obsidian/components/plugin-settings-tab-component', async () => ({
  PluginSettingsTabComponent: await loadableComponentStub()
}));

vi.mock('obsidian-dev-utils/obsidian/command-handlers/open-settings-command-handler', () => ({
  OpenSettingsCommandHandler: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/active-file-provider', () => ({
  AppActiveFileProvider: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/command-registrar', () => ({
  PluginCommandRegistrar: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/data-handler', () => ({
  PluginDataHandler: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin-event-source', () => ({
  PluginEventSourceImpl: vi.fn()
}));

vi.mock('./prism-component.ts', async () => ({
  PrismComponent: await loadableComponentStub()
}));

vi.mock('./plugin-settings-component.ts', async () => ({
  PluginSettingsComponent: await loadableComponentStub()
}));

vi.mock('./providers/email-provider-manager.ts', async () => ({
  EmailProviderManagerComponent: await loadableComponentStub()
}));

vi.mock('./email-checker.ts', async () => ({
  EmailCheckerComponent: await loadableComponentStub()
}));

vi.mock('./providers/mail-tm/mail-tm-domain-manager.ts', () => ({
  MailTmDomainManager: vi.fn()
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

const MockPluginDataHandler = vi.mocked(PluginDataHandler);
const MockPluginEventSourceImpl = vi.mocked(PluginEventSourceImpl);
const MockCheckEmailsCommandHandler = vi.mocked(CheckEmailsCommandHandler);
const MockEmailChecker = vi.mocked(EmailCheckerComponent);
const MockEmailNoteCreator = vi.mocked(EmailNoteCreator);
const MockMailTmDomainManager = vi.mocked(MailTmDomainManager);
const MockEmailProviderManager = vi.mocked(EmailProviderManagerComponent);
const MockPluginSettingsComponent = vi.mocked(PluginSettingsComponent);
const MockPluginSettingsTab = vi.mocked(PluginSettingsTab);
const MockPrismComponent = vi.mocked(PrismComponent);
const MockRedownloadAllEmailsCommandHandler = vi.mocked(RedownloadAllEmailsCommandHandler);
const MockRedownloadRecentEmailsCommandHandler = vi.mocked(RedownloadRecentEmailsCommandHandler);

const manifest: PluginManifest = {
  author: 'test',
  description: 'test',
  id: 'email-to-vault',
  minAppVersion: '1.0.0',
  name: 'Email to Vault',
  version: '1.0.0'
};

let app: AppOriginal;

interface PluginWithNoticeComponent {
  readonly pluginNoticeComponent: PluginNoticeComponent;
}

function instanceOf(mock: ReturnType<typeof vi.fn>): unknown {
  // The value that flows through `addChild` is the constructor's return value.
  return mock.mock.results[0]?.value;
}

function noticeComponentOf(plugin: Plugin): PluginNoticeComponent {
  // `pluginNoticeComponent` is `protected` on the dev-utils `PluginBase`; the plugin wires this exact
  // Instance into every collaborator, so the tests assert against the real instance rather than a matcher.
  return castTo<PluginWithNoticeComponent>(plugin).pluginNoticeComponent;
}

describe('Plugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const appMock = App.createConfigured__();
    appMock.workspace.onLayoutReady = vi.fn((cb: () => void) => {
      cb();
    });
    app = appMock.asOriginalType__();
  });

  describe('onload', () => {
    it('should create MailTmDomainManager', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(MockMailTmDomainManager).toHaveBeenCalledOnce();
    });

    it('should create PluginSettingsComponent with dataHandler, mailTmDomainManager, and pluginId', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(MockPluginSettingsComponent).toHaveBeenCalledWith({
        dataHandler: MockPluginDataHandler.mock.instances[0],
        mailTmDomainManager: MockMailTmDomainManager.mock.instances[0],
        pluginEventSource: MockPluginEventSourceImpl.mock.instances[0],
        pluginId: 'email-to-vault',
        pluginSettingsClass: PluginSettings
      });
    });

    it('should create EmailProviderManager with app, mailTmDomainManager, pluginId, pluginNoticeComponent, and pluginSettingsComponent', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(MockEmailProviderManager).toHaveBeenCalledWith({
        app,
        mailTmDomainManager: MockMailTmDomainManager.mock.instances[0],
        pluginId: 'email-to-vault',
        pluginNoticeComponent: noticeComponentOf(plugin),
        pluginSettingsComponent: instanceOf(MockPluginSettingsComponent)
      });
    });

    it('should create EmailNoteCreator with app, emailProvider, pluginNoticeComponent, and pluginSettingsComponent', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(MockEmailNoteCreator).toHaveBeenCalledWith({
        app,
        emailProvider: instanceOf(MockEmailProviderManager),
        pluginNoticeComponent: noticeComponentOf(plugin),
        pluginSettingsComponent: instanceOf(MockPluginSettingsComponent)
      });
    });

    it('should create EmailChecker with emailNoteCreator, emailProvider, pluginNoticeComponent, and pluginSettingsComponent', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(MockEmailChecker).toHaveBeenCalledWith({
        emailNoteCreator: MockEmailNoteCreator.mock.instances[0],
        emailProvider: instanceOf(MockEmailProviderManager),
        pluginNoticeComponent: noticeComponentOf(plugin),
        pluginSettingsComponent: instanceOf(MockPluginSettingsComponent)
      });
    });

    it('should create PluginSettingsTab with plugin, settings component, provider manager, notice component, and manifest id', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(MockPluginSettingsTab).toHaveBeenCalledWith({
        emailProviderManager: instanceOf(MockEmailProviderManager),
        plugin,
        pluginId: 'email-to-vault',
        pluginNoticeComponent: noticeComponentOf(plugin),
        pluginSettingsComponent: instanceOf(MockPluginSettingsComponent)
      });
    });

    it('should create PrismComponent', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(MockPrismComponent).toHaveBeenCalledOnce();
    });

    it('should create CheckEmailsCommandHandler with emailChecker', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(MockCheckEmailsCommandHandler).toHaveBeenCalledWith(
        instanceOf(MockEmailChecker)
      );
    });

    it('should create RedownloadAllEmailsCommandHandler with emailChecker', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(MockRedownloadAllEmailsCommandHandler).toHaveBeenCalledWith(
        instanceOf(MockEmailChecker)
      );
    });

    it('should create RedownloadRecentEmailsCommandHandler with app and emailChecker', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(MockRedownloadRecentEmailsCommandHandler).toHaveBeenCalledWith({
        app,
        emailChecker: instanceOf(MockEmailChecker)
      });
    });

    it('should add the plugin components as children', async () => {
      const plugin = new Plugin(app, manifest);
      const addChildSpy = vi.spyOn(plugin, 'addChild');
      await plugin.onload();

      expect(addChildSpy).toHaveBeenCalledWith(instanceOf(MockPluginSettingsComponent));
      expect(addChildSpy).toHaveBeenCalledWith(instanceOf(MockEmailProviderManager));
      expect(addChildSpy).toHaveBeenCalledWith(instanceOf(MockEmailChecker));
      expect(addChildSpy).toHaveBeenCalledWith(instanceOf(MockPrismComponent));
    });
  });
});
