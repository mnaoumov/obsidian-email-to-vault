import type { CommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/command-handler';
import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type { DisposableEx } from '@mnaoumov/typescript-lib/disposable';
import type {
  App as AppOriginal,
  PluginManifest
} from 'obsidian';

import { CommandHandlerComponent } from '@mnaoumov/obsidian-lib/command-handlers/command-handler-component';
import { OpenDemoVaultCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/open-demo-vault-command-handler';
import { OpenSettingsCommandHandler } from '@mnaoumov/obsidian-lib/command-handlers/open-settings-command-handler';
import { ComponentEx } from '@mnaoumov/obsidian-lib/components/component-ex';
import { TemplatesLanguageComponent } from '@mnaoumov/obsidian-lib/components/templates-language-component';
import { PluginDataHandler } from '@mnaoumov/obsidian-lib/data-handler';
import { PluginEventSourceImpl } from '@mnaoumov/obsidian-lib/plugin/plugin-event-source';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
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
import { TOKENIZED_STRING_LANGUAGE } from './tokenized-string-language.ts';

// An obsidian-lib/own component that is added via `addChild` must be loadable, so its stub returns a
// real `Component`. The flowing instance is the stub's return value (`mock.results[0].value`),
// not the discarded `this` (`mock.instances[0]`).
interface ObsidianComponentModule {
  readonly Component: new () => object;
}

// The settings component is awaited (`loadWithPromises`) by `onloadImpl`, which a plain `Component` does
// not have — so its stub returns a `ComponentEx`.
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
  // break the test-mocks `Component` constructor's own strict proxy.
  // eslint-disable-next-line prefer-arrow-callback -- See above; an arrow cannot be used here.
  return vi.fn(function componentStub() {
    return new Component();
  });
}

vi.mock('@mnaoumov/obsidian-lib/components/plugin-settings-tab-component', async () => ({
  PluginSettingsTabComponent: await loadableComponentStub()
}));

vi.mock('@mnaoumov/obsidian-lib/command-handlers/open-demo-vault-command-handler', () => ({
  OpenDemoVaultCommandHandler: vi.fn()
}));

vi.mock('@mnaoumov/obsidian-lib/command-handlers/open-settings-command-handler', () => ({
  OpenSettingsCommandHandler: vi.fn()
}));

// `PluginDataHandler` and `PluginEventSourceImpl` are NOT stubbed: the base
// builds its own settings component out of them during `onload`, and that component really calls
// `pluginEventSource.on`, so a bare `vi.fn()` double makes the base throw before `onloadImpl` runs.
vi.mock('@mnaoumov/obsidian-lib/components/templates-language-component', async () => ({
  TemplatesLanguageComponent: await loadableComponentStub()
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
// is asserted without exercising the mocked command handlers against a real registrar.
vi.spyOn(CommandHandlerComponent.prototype, 'registerCommandHandlers').mockResolvedValue(strictProxy<DisposableEx>({}));

const MockCheckEmailsCommandHandler = vi.mocked(CheckEmailsCommandHandler);
const MockEmailChecker = vi.mocked(EmailCheckerComponent);
const MockEmailNoteCreator = vi.mocked(EmailNoteCreator);
const MockMailTmDomainManager = vi.mocked(MailTmDomainManager);
const MockEmailProviderManager = vi.mocked(EmailProviderManagerComponent);
const MockPluginSettingsComponent = vi.mocked(PluginSettingsComponent);
const MockPluginSettingsTab = vi.mocked(PluginSettingsTab);
const MockTemplatesLanguageComponent = vi.mocked(TemplatesLanguageComponent);
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
  // `pluginNoticeComponent` is `protected` on the obsidian-lib `PluginBase`; the plugin wires this exact
  // instance into every collaborator, so the tests assert against the real instance rather than a matcher.
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

    it('should create PluginSettingsComponent with dataHandler and pluginId', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      const params = MockPluginSettingsComponent.mock.calls[0]?.[0];
      expect(params?.dataHandler).toBeInstanceOf(PluginDataHandler);
      expect(params?.pluginEventSource).toBeInstanceOf(PluginEventSourceImpl);
      expect(params).toMatchObject({
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

    it('should create TemplatesLanguageComponent for the plugin language', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      expect(MockTemplatesLanguageComponent).toHaveBeenCalledOnce();
      expect(MockTemplatesLanguageComponent).toHaveBeenCalledWith({ language: TOKENIZED_STRING_LANGUAGE });
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
      expect(addChildSpy).toHaveBeenCalledWith(instanceOf(MockTemplatesLanguageComponent));
    });

    it('should register the command handlers on the pre-wired commandHandlerComponent', async () => {
      const plugin = new Plugin(app, manifest);
      await plugin.onload();

      // The base separately auto-registers its own handler, so assert the plugin's own registration by its five
      // handlers rather than the total call count.
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

// `registerCommandHandlers` takes a factory, and the base registers its
// own handlers through the same spy — so pick the plugin's own factory by what it builds.
function buildPluginCommandHandlers(): CommandHandler[] {
  const commandHandlerBatches = vi.mocked(CommandHandlerComponent.prototype.registerCommandHandlers).mock.calls
    .map(([commandHandlerFactory]) => commandHandlerFactory());
  const pluginCommandHandlers = commandHandlerBatches.find((commandHandlers) => commandHandlers.some((commandHandler) => commandHandler instanceof CheckEmailsCommandHandler));
  if (!pluginCommandHandlers) {
    throw new Error('The plugin did not register its own command handlers.');
  }
  return pluginCommandHandlers;
}
