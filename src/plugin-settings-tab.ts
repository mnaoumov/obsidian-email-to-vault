import type {
  SettingDefinitionGroup,
  SettingDefinitionItem
} from 'obsidian';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { PluginSettingsTabBaseConstructorParams } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { appendCodeBlock } from 'obsidian-dev-utils/obsidian/html-element';
import { confirm } from 'obsidian-dev-utils/obsidian/modals/confirm';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';
import type { EmailProviderManagerComponent } from './providers/email-provider-manager.ts';

import { TOKENIZED_STRING_LANGUAGE } from './prism-component.ts';
import { EmailProviderType } from './providers/email-provider-type.ts';

interface PluginSettingsTabConstructorParams extends PluginSettingsTabBaseConstructorParams<PluginSettings> {
  readonly emailProviderManager: EmailProviderManagerComponent;
  readonly pluginId: string;
  readonly pluginNoticeComponent: PluginNoticeComponent;
}

export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  private readonly emailProviderManager: EmailProviderManagerComponent;
  private readonly pluginId: string;
  private readonly pluginNoticeComponent: PluginNoticeComponent;

  public constructor(params: PluginSettingsTabConstructorParams) {
    super(params);
    this.emailProviderManager = params.emailProviderManager;
    this.pluginId = params.pluginId;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
  }

  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    const items: SettingDefinitionItem[] = [this.buildProviderSelectionGroup()];

    switch (this.pluginSettingsComponent.settings.emailProviderType) {
      case EmailProviderType.Imap:
        items.push(this.buildImapGroup());
        break;
      case EmailProviderType.MailTm: {
        const mailTmGroup = this.buildMailTmGroup();
        if (mailTmGroup) {
          items.push(mailTmGroup);
        }

        break;
      }
      /* v8 ignore start -- exhaustive switch guard for future enum values. */
      default:
        break;
        /* v8 ignore stop */
    }

    items.push(this.buildMainGroup());
    return items;
  }

  private buildImapGroup(): SettingDefinitionGroup {
    return this.settingGroupEx({
      heading: 'IMAP',
      items: [
        this.settingEx({
          desc: createFragment((f) => {
            f.appendText('Connect to any IMAP-compatible email server (Gmail, Outlook, etc.).');
            f.createEl('br');
            f.appendText('⚠️ IMAP emails cannot be checked on mobile devices.');
          }),
          name: '',
          render: () => {
            // The row is a blurb; there is nothing to add to it.
          },
          searchable: false
        }),
        this.settingEx({
          desc: 'Hostname of the mail server.',
          name: 'Server host',
          render: (setting) => {
            setting.addText((text) => {
              this.bind({ propertyName: 'imapHost', valueComponent: text });
            });
          }
        }),
        this.settingEx({
          desc: 'Port number for the mail server.',
          name: 'Server port',
          render: (setting) => {
            setting.addNumber((numberComponent) => {
              numberComponent.setMin(1);
              this.bind({ propertyName: 'imapPort', valueComponent: numberComponent });
            });
          }
        }),
        this.settingEx({
          desc: 'Use TLS/SSL for the connection.',
          name: 'Use TLS',
          render: (setting) => {
            setting.addToggle((toggle) => {
              this.bind({ propertyName: 'imapTls', valueComponent: toggle });
            });
          }
        }),
        this.settingEx({
          desc: 'Mailbox folder to check for emails.',
          name: 'Mailbox',
          render: (setting) => {
            setting.addText((text) => {
              this.bind({ propertyName: 'imapMailbox', valueComponent: text });
            });
          }
        }),
        this.settingEx({
          desc: 'Email address used as the login username.',
          name: 'Email address',
          render: (setting) => {
            setting
              .setClass('email-address')
              .addEmail((emailComponent) => {
                this.bind({ propertyName: 'emailAddress', valueComponent: emailComponent });
              });
          }
        }),
        this.settingEx({
          desc: createFragment((f) => {
            f.appendText('Password for the mail server.');
            f.createEl('br');
            f.appendText('For Gmail with 2FA, use an ');
            f.createEl('a', { href: 'https://myaccount.google.com/apppasswords', text: 'App password' });
            f.appendText('.');
          }),
          name: 'Email password',
          render: (setting) => {
            setting.addPassword((passwordComponent) => {
              const password = this.app.secretStorage.getSecret(this.pluginSettingsComponent.settings.emailPasswordSecretKey) ?? '';
              passwordComponent.setValue(password);
              passwordComponent.onChange(convertAsyncToSync(async (value: string) => {
                await this.ensurePasswordSecretKey();
                this.app.secretStorage.setSecret(this.pluginSettingsComponent.settings.emailPasswordSecretKey, value);
              }));
            });
          }
        }),
        this.settingEx({
          desc: 'Whether to delete emails from the mailbox after being saved as notes.',
          name: 'Delete seen emails',
          render: (setting) => {
            setting.addToggle((toggle) => {
              this.bind({ propertyName: 'shouldDeleteSeenEmails', valueComponent: toggle });
            });
          }
        })
      ]
    });
  }

  private buildMailTmGroup(): null | SettingDefinitionGroup {
    const mailTmProvider = this.emailProviderManager.getMailTmProvider();
    if (!mailTmProvider) {
      return null;
    }

    const isRegistered = !!this.pluginSettingsComponent.settings.emailAddress;

    return this.settingGroupEx({
      heading: 'Mail.tm',
      items: [
        this.settingEx({
          desc: createFragment((f) => {
            f.appendText('The plugin is powered by ');
            f.createEl('a', { href: 'https://mail.tm/', text: 'mail.tm' });
            f.appendText(' — a temporary email service. Emails are stored for up to 7 days. See ');
            f.createEl('a', { href: 'https://github.com/mnaoumov/obsidian-email-to-vault#privacy--data-handling', text: 'Privacy & data handling' });
            f.appendText(' for details.');
          }),
          name: '',
          render: () => {
            // The row is a blurb; there is nothing to add to it.
          },
          searchable: false
        }),
        this.settingEx({
          name: '',
          render: (setting) => {
            setting.addButton((button) => {
              if (isRegistered) {
                button
                  .setButtonText('Unregister email address')
                  .setDestructive()
                  .onClick(convertAsyncToSync(async () => {
                    const result = await confirm({
                      app: this.app,
                      cancelButtonText: 'No',
                      message: 'Are you sure you want to unregister your email address? You will not have access to it anymore.',
                      okButtonText: 'Yes',
                      title: 'Unregister email address?'
                    });
                    if (!result) {
                      return;
                    }

                    await mailTmProvider.unregisterEmailAddress();

                    // Registering and unregistering change which rows the group contains, so the tab has to
                    // Be rebuilt rather than merely re-evaluated.
                    this.refresh();
                  }));
              } else {
                button
                  .setButtonText('Register new random email address')
                  .onClick(convertAsyncToSync(async () => {
                    await mailTmProvider.registerRandomEmailAddress();

                    this.refresh();
                  }));
              }
            });
          },
          searchable: false
        }),
        this.settingEx({
          desc: 'Email address for the mail.tm mailbox.',
          name: 'Email address',
          render: (setting) => {
            setting
              .setClass('email-address')
              .addEmail((emailComponent) => {
                emailComponent.setDisabled(isRegistered);
                this.bind({ propertyName: 'emailAddress', valueComponent: emailComponent });
              })
              .addExtraButton((button) => {
                button
                  .setTooltip('Copy to clipboard')
                  .setIcon('clipboard')
                  .onClick(convertAsyncToSync(async () => {
                    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- navigator.clipboard is the Web Clipboard API, available in Obsidian's Electron renderer; the rule incorrectly flags it as a Node experimental builtin.
                    await navigator.clipboard.writeText(this.pluginSettingsComponent.settings.emailAddress);
                    this.pluginNoticeComponent.showNotice('Email address copied to clipboard');
                  }));
              });
          }
        }),
        this.settingEx({
          desc: 'Password for the mail.tm mailbox.',
          name: 'Email password',
          render: (setting) => {
            setting
              .addPassword((passwordComponent) => {
                passwordComponent.setDisabled(isRegistered);
                const password = this.app.secretStorage.getSecret(this.pluginSettingsComponent.settings.emailPasswordSecretKey) ?? '';
                passwordComponent.setValue(password);
                if (!isRegistered) {
                  passwordComponent.onChange(convertAsyncToSync(async (value: string) => {
                    await this.ensurePasswordSecretKey();
                    this.app.secretStorage.setSecret(this.pluginSettingsComponent.settings.emailPasswordSecretKey, value);
                  }));
                }
              })
              .addExtraButton((button) => {
                button
                  .setTooltip('Copy to clipboard')
                  .setIcon('clipboard')
                  .onClick(convertAsyncToSync(async () => {
                    const password = this.app.secretStorage.getSecret(this.pluginSettingsComponent.settings.emailPasswordSecretKey);
                    if (!password) {
                      this.pluginNoticeComponent.showNotice('No email password found');
                      return;
                    }
                    // eslint-disable-next-line n/no-unsupported-features/node-builtins -- navigator.clipboard is the Web Clipboard API, available in Obsidian's Electron renderer; the rule incorrectly flags it as a Node experimental builtin.
                    await navigator.clipboard.writeText(password);
                    this.pluginNoticeComponent.showNotice('Email password copied to clipboard');
                  }));
              });
          }
        }),
        this.settingEx({
          desc: createFragment((f) => {
            f.appendText('Whether to delete emails from the mailbox after being saved as notes.');
            f.createEl('br');
            f.appendText('⚠️ WARNING: deleted emails cannot be recovered.');
            f.createEl('br');
            f.appendText('⚠️ WARNING: even if the setting is disabled, the emails will be deleted after 7 days. See ');
            f.createEl('a', { href: 'https://github.com/mnaoumov/obsidian-email-to-vault#privacy--data-handling', text: 'Privacy & data handling' });
            f.appendText(' for details.');
          }),
          name: 'Delete seen emails',
          render: (setting) => {
            setting.addToggle((toggle) => {
              this.bind({ propertyName: 'shouldDeleteSeenEmails', valueComponent: toggle });
            });
          }
        })
      ]
    });
  }

  private buildMainGroup(): SettingDefinitionGroup {
    return this.settingGroupEx({
      heading: 'Main',
      items: [
        this.settingEx({
          desc: createFragment((f) => {
            f.appendText('The interval at which emails will be checked in minutes.');
            f.createEl('br');
            f.appendText('Set to 0 to disable automatic email checking.');
          }),
          name: 'Email check interval',
          render: (setting) => {
            setting.addNumber((numberComponent) => {
              numberComponent.setMin(0);
              this.bind({ propertyName: 'emailCheckIntervalInMinutes', valueComponent: numberComponent });
            });
          }
        }),
        this.settingEx({
          desc: createFragment((f) => {
            f.appendText('Path template for saved email notes.');
            f.createEl('br');
            appendVariables(f);
          }),
          name: 'Email note path template',
          render: (setting) => {
            setting.addCodeHighlighter((codeHighlighter) => {
              codeHighlighter.setLanguage(TOKENIZED_STRING_LANGUAGE);
              this.bind({ propertyName: 'emailNotePathTemplate', valueComponent: codeHighlighter });
            });
          }
        }),
        this.settingEx({
          desc: createFragment((f) => {
            f.appendText('The template to use for email note content.');
            f.createEl('br');
            appendVariables(f);
          }),
          name: 'Email note template',
          render: (setting) => {
            setting
              .setClass('email-note-template')
              .addCodeHighlighter((codeHighlighter) => {
                codeHighlighter.setLanguage(TOKENIZED_STRING_LANGUAGE);
                this.bind({ propertyName: 'emailNoteTemplate', valueComponent: codeHighlighter });
              });
          }
        }),
        this.settingEx({
          desc: createFragment((f) => {
            f.appendText('Whether to extract the original sender, recipients, and subject from forwarded emails.');
            f.createEl('br');
            f.appendText('When enabled, treats forwarded emails as direct messages.');
          }),
          name: 'Extract forwarded email',
          render: (setting) => {
            setting.addToggle((toggle) => {
              this.bind({ propertyName: 'shouldExtractForwardedEmail', valueComponent: toggle });
            });
          }
        }),
        this.settingEx({
          desc: 'Whether to remove hidden HTML elements (display:none, visibility:hidden, opacity:0, aria-hidden) before converting to markdown.',
          name: 'Strip hidden elements',
          render: (setting) => {
            setting.addToggle((toggle) => {
              this.bind({ propertyName: 'shouldStripHiddenElements', valueComponent: toggle });
            });
          }
        }),
        this.settingEx({
          desc: createFragment((f) => {
            f.appendText('Whether to flag emails as seen on the server after they are saved as notes.');
            f.createEl('br');
            f.appendText('Disable to leave emails untouched on the server, so they stay unread in your other email clients.');
            f.createEl('br');
            f.appendText('When disabled, already-imported emails are tracked by date instead of the seen flag.');
            f.createEl('br');
            f.appendText('Ignored when "Delete seen emails" is enabled.');
          }),
          name: 'Mark emails as seen',
          render: (setting) => {
            setting.addToggle((toggle) => {
              this.bind({ propertyName: 'shouldMarkEmailsAsSeen', valueComponent: toggle });
            });
          }
        })
      ]
    });
  }

  private buildProviderSelectionGroup(): SettingDefinitionGroup {
    return this.settingGroupEx({
      heading: 'Provider',
      items: [
        this.settingEx({
          desc: 'Select which email provider to use.',
          name: 'Email provider',
          render: (setting) => {
            setting.addDropdown((dropdown) => {
              dropdown
                .addOption(EmailProviderType.MailTm, 'Mail.tm')
                .addOption(EmailProviderType.Imap, 'IMAP');
              this.bind({
                onChanged: () => {
                  // Switching the provider swaps a whole group in and out, so the definitions themselves
                  // Change — that needs a rebuild, not a predicate re-evaluation.
                  this.refresh();
                },
                propertyName: 'emailProviderType',
                valueComponent: dropdown
              });
            });
          }
        })
      ]
    });
  }

  private async ensurePasswordSecretKey(): Promise<void> {
    if (this.pluginSettingsComponent.settings.emailPasswordSecretKey) {
      return;
    }

    const secretKey = `${this.pluginId}-password`;
    await this.pluginSettingsComponent.editAndSave((settings) => {
      settings.emailPasswordSecretKey = secretKey;
    });
  }
}

function appendVariables(f: DocumentFragment): void {
  const variables = ['{{cc}}', '{{date:FORMAT}}', '{{from}}', '{{subject}}', '{{to}}'];

  f.appendText('Variables:');
  const ol = f.createEl('ul');
  for (const variable of variables) {
    const li = ol.createEl('li');
    appendCodeBlock(li, variable);
  }

  f.appendText('Date format uses ');
  f.createEl('a', { href: 'https://momentjs.com/docs/#/displaying/format/', text: 'Moment.js format' });
  f.appendText('.');
}
