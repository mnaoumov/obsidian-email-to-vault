import type {
  App as AppOriginal,
  PluginManifest
} from 'obsidian';
import type { DisposableEx } from 'obsidian-dev-utils/disposable';
import type { CommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/command-handler';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { CommandHandlerComponent } from 'obsidian-dev-utils/obsidian/command-handlers/command-handler-component';
import { OpenDemoVaultCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler';
import { OpenSettingsCommandHandler } from 'obsidian-dev-utils/obsidian/command-handlers/open-settings-command-handler';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';
import { PluginDataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import { PluginEventSourceImpl } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
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
import { EmailProviderManagerComponent } from './providers/email-provider-manager.ts';
import { MailTmDomainManager } from './providers/mail-tm/mail-tm-domain-manager.ts';
import { TokenizedStringLanguageComponent } from './tokenized-string-language-component.ts';

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

// The settings component is awaited (`loadWithPromises`) by `onloadImpl`, which a plain `Component` does
// Not have — so its stub returns a `ComponentEx`.
function loadableComponentExStub(): ReturnType<typeof vi.fn> {
  // eslint-disable-next-line prefer-arrow-callback -- Same reason as loadableComponentStub below.
  return vi.fn(function componentExStub() {
    return new ComponentEx();
  });
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

vi.mock('obsidian-dev-utils/obsidian/components/plugin-settings-tab-component', async () => ({
  PluginSettingsTabComponent: await loadableComponentStub()
}));

vi.mock('obsidian-dev-utils/obsidian/command-handlers/open-demo-vault-command-handler', () => ({
  OpenDemoVaultCommandHandler: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/command-handlers/open-settings-command-handler', () => ({
  OpenSettingsCommandHandler: vi.fn()
}));

// `PluginDataHandler` and `PluginEventSourceImpl` are NOT stubbed: since obsidian-dev-utils 93.2 the base
// Builds its own settings component out of them during `onload`, and that component really calls
// `pluginEventSource.on`, so a bare `vi.fn()` double makes the base throw before `onloadImpl` runs (G49).
vi.mock('./tokenized-string-language-component.ts', async () => ({
  TokenizedStringLanguageComponent: await loadableComponentStub()
}));

vi.mock('./plugin-settings-component.ts', () => ({
  PluginSettingsComponent: loadableComponentExStub()
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

// The base pre-wires `commandHandlerComponent`; stub its `registerCommandHandlers` so the plugin's registration
// Is asserted without exercising the mocked command handlers against a real registrar.
vi.spyOn(CommandHandlerComponent.prototype, 'registerCommandHandlers').mockResolvedValue(strictProxy<DisposableEx>({}));

const MockCheckEmailsCommandHandler = vi.mocked(CheckEmailsCommandHandler);
const MockEmailChecker = vi.mocked(EmailCheckerComponent);
const MockEmailNoteCreator = vi.mocked(EmailNoteCreator);
const MockMailTmDomainManager = vi.mocked(MailTmDomainManager);
const MockEmailProviderManager = vi.mocked(EmailProviderManagerComponent);
const MockPluginSettingsComponent = vi.mocked(PluginSettingsComponent);
const MockPluginSettingsTab = vi.mocked(PluginSettingsTab);
const MockTokenizedStringLanguageComponent = vi.mocked(TokenizedStringLanguageComponent);
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
    appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
      callback();
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

      const params = MockPluginSettingsComponent.mock.calls[0]?.[0];
      expect(params?.dataHandler).toBeInstanceOf(PluginDataHandler);
      expect(params?.pluginEventSource).toBeInstanceOf(PluginEventSourceImpl);
      expect(params).toMatchObject({
        mailTmDomainManager: MockMailTmDomainManager.mock.instances[0],
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

    it('should create TokenizedStringLanguageComponent', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(MockTokenizedStringLanguageComponent).toHaveBeenCalledOnce();
    });

    it('should create CheckEmailsCommandHandler with emailChecker', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();
      buildPluginCommandHandlers();

      expect(MockCheckEmailsCommandHandler).toHaveBeenCalledWith(
        instanceOf(MockEmailChecker)
      );
    });

    it('should create RedownloadAllEmailsCommandHandler with emailChecker', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();
      buildPluginCommandHandlers();

      expect(MockRedownloadAllEmailsCommandHandler).toHaveBeenCalledWith(
        instanceOf(MockEmailChecker)
      );
    });

    it('should create RedownloadRecentEmailsCommandHandler with app and emailChecker', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();
      buildPluginCommandHandlers();

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
      expect(addChildSpy).toHaveBeenCalledWith(instanceOf(MockTokenizedStringLanguageComponent));
    });

    it('should register the command handlers on the pre-wired commandHandlerComponent', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      // The base separately auto-registers its own handler, so assert the plugin's own registration by its five
      // Handlers rather than the total call count.
      expect(buildPluginCommandHandlers()).toStrictEqual([
        expect.any(CheckEmailsCommandHandler),
        expect.any(OpenDemoVaultCommandHandler),
        expect.any(OpenSettingsCommandHandler),
        expect.any(RedownloadAllEmailsCommandHandler),
        expect.any(RedownloadRecentEmailsCommandHandler)
      ]);
    });
  });
});

// `registerCommandHandlers` takes a factory since obsidian-dev-utils 89.0.0, and the base registers its
// Own handlers through the same spy — so pick the plugin's own factory by what it builds.
function buildPluginCommandHandlers(): CommandHandler[] {
  const commandHandlerBatches = vi.mocked(CommandHandlerComponent.prototype.registerCommandHandlers).mock.calls
    .map(([commandHandlerFactory]) => commandHandlerFactory());
  const pluginCommandHandlers = commandHandlerBatches.find((commandHandlers) => commandHandlers.some((commandHandler) => commandHandler instanceof CheckEmailsCommandHandler));
  if (!pluginCommandHandlers) {
    throw new Error('The plugin did not register its own command handlers.');
  }
  return pluginCommandHandlers;
}
