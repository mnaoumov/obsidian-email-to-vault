import type { PluginSettingsTabBaseConstructorParams } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import { Notice } from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/async';
import { appendCodeBlock } from 'obsidian-dev-utils/html-element';
import { confirm } from 'obsidian-dev-utils/obsidian/modals/confirm';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';
import { SettingGroupEx } from 'obsidian-dev-utils/obsidian/setting-group-ex';

import type { PluginSettings } from './plugin-settings.ts';
import type { EmailProviderManagerComponent } from './providers/email-provider-manager.ts';

import { TOKENIZED_STRING_LANGUAGE } from './prism-component.ts';
import { EmailProviderType } from './providers/email-provider-type.ts';

interface PluginSettingsTabConstructorParams extends PluginSettingsTabBaseConstructorParams<PluginSettings> {
  readonly emailProviderManager: EmailProviderManagerComponent;
  readonly pluginId: string;
}

export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  private readonly emailProviderManager: EmailProviderManagerComponent;
  private readonly pluginId: string;

  public constructor(params: PluginSettingsTabConstructorParams) {
    super(params);
    this.emailProviderManager = params.emailProviderManager;
    this.pluginId = params.pluginId;
  }

  public override displayLegacy(): void {
    super.displayLegacy();

    this.displayProviderSelection();

    switch (this.pluginSettingsComponent.settings.emailProviderType) {
      case EmailProviderType.Imap:
        this.displayImapSettings();
        break;
      case EmailProviderType.MailTm:
        this.displayMailTmSettings();
        break;
      /* v8 ignore start -- exhaustive switch guard for future enum values. */
      default:
        break;
        /* v8 ignore stop */
    }

    new SettingGroupEx(this.containerEl)
      .setHeading('Main')
      .addSettingEx((setting) => {
        setting
          .setName('Email check interval')
          .setDesc(createFragment((f) => {
            f.appendText('The interval at which emails will be checked in minutes.');
            f.createEl('br');
            f.appendText('Set to 0 to disable automatic email checking.');
          }))
          .addNumber((numberComponent) => {
            numberComponent.setMin(0);
            this.bind(numberComponent, 'emailCheckIntervalInMinutes');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Email note path template')
          .setDesc(createFragment((f) => {
            f.appendText('Path template for saved email notes.');
            f.createEl('br');
            appendVariables(f);
          }))
          .addCodeHighlighter((codeHighlighter) => {
            codeHighlighter.setLanguage(TOKENIZED_STRING_LANGUAGE);
            this.bind(codeHighlighter, 'emailNotePathTemplate');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setClass('email-note-template')
          .setName('Email note template')
          .setDesc(createFragment((f) => {
            f.appendText('The template to use for email note content.');
            f.createEl('br');
            appendVariables(f);
          }))
          .addCodeHighlighter((codeHighlighter) => {
            codeHighlighter.setLanguage(TOKENIZED_STRING_LANGUAGE);
            this.bind(codeHighlighter, 'emailNoteTemplate');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Extract forwarded email')
          .setDesc(createFragment((f) => {
            f.appendText('Whether to extract the original sender, recipients, and subject from forwarded emails.');
            f.createEl('br');
            f.appendText('When enabled, treats forwarded emails as direct messages.');
          }))
          .addToggle((toggle) => {
            this.bind(toggle, 'shouldExtractForwardedEmail');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Strip hidden elements')
          .setDesc('Whether to remove hidden HTML elements (display:none, visibility:hidden, opacity:0, aria-hidden) before converting to markdown.')
          .addToggle((toggle) => {
            this.bind(toggle, 'shouldStripHiddenElements');
          });
      });
  }

  private displayImapSettings(): void {
    new SettingGroupEx(this.containerEl)
      .setHeading('IMAP')
      .addSettingEx((setting) => {
        setting
          .setDesc(createFragment((f) => {
            f.appendText('Connect to any IMAP-compatible email server (Gmail, Outlook, etc.).');
            f.createEl('br');
            f.appendText('⚠️ IMAP emails cannot be checked on mobile devices.');
          }));
      })
      .addSettingEx((setting) => {
        setting
          .setName('Server host')
          .setDesc('Hostname of the mail server.')
          .addText((text) => {
            this.bind(text, 'imapHost');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Server port')
          .setDesc('Port number for the mail server.')
          .addNumber((numberComponent) => {
            numberComponent.setMin(1);
            this.bind(numberComponent, 'imapPort');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Use TLS')
          .setDesc('Use TLS/SSL for the connection.')
          .addToggle((toggle) => {
            this.bind(toggle, 'imapTls');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Mailbox')
          .setDesc('Mailbox folder to check for emails.')
          .addText((text) => {
            this.bind(text, 'imapMailbox');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setClass('email-address')
          .setName('Email address')
          .setDesc('Email address used as the login username.')
          .addEmail((emailComponent) => {
            this.bind(emailComponent, 'emailAddress');
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Email password')
          .setDesc(createFragment((f) => {
            f.appendText('Password for the mail server.');
            f.createEl('br');
            f.appendText('For Gmail with 2FA, use an ');
            f.createEl('a', { href: 'https://myaccount.google.com/apppasswords', text: 'App password' });
            f.appendText('.');
          }))
          .addPassword((passwordComponent) => {
            const password = this.app.secretStorage.getSecret(this.pluginSettingsComponent.settings.emailPasswordSecretKey) ?? '';
            passwordComponent.setValue(password);
            passwordComponent.onChange(convertAsyncToSync(async (value: string) => {
              await this.ensurePasswordSecretKey();
              this.app.secretStorage.setSecret(this.pluginSettingsComponent.settings.emailPasswordSecretKey, value);
            }));
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Delete seen emails')
          .setDesc('Whether to delete emails from the mailbox after being saved as notes.')
          .addToggle((toggle) => {
            this.bind(toggle, 'shouldDeleteSeenEmails');
          });
      });
  }

  private displayMailTmSettings(): void {
    const mailTmProvider = this.emailProviderManager.getMailTmProvider();
    if (!mailTmProvider) {
      return;
    }

    const isRegistered = !!this.pluginSettingsComponent.settings.emailAddress;

    new SettingGroupEx(this.containerEl)
      .setHeading('Mail.tm')
      .addSettingEx((setting) => {
        setting
          .setDesc(createFragment((f) => {
            f.appendText('The plugin is powered by ');
            f.createEl('a', { href: 'https://mail.tm/', text: 'mail.tm' });
            f.appendText(' — a temporary email service. Emails are stored for up to 7 days. See ');
            f.createEl('a', { href: 'https://github.com/mnaoumov/obsidian-email-to-vault#privacy--data-handling', text: 'Privacy & data handling' });
            f.appendText(' for details.');
          }));
      })
      .addSettingEx((setting) => {
        setting
          .addButton((button) => {
            if (isRegistered) {
              button
                .setButtonText('Unregister email address')
                .setWarning()
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

                  this.displayLegacy();
                }));
            } else {
              button
                .setButtonText('Register new random email address')
                .onClick(convertAsyncToSync(async () => {
                  await mailTmProvider.registerRandomEmailAddress();

                  this.displayLegacy();
                }));
            }
          });
      })
      .addSettingEx((setting) => {
        setting
          .setClass('email-address')
          .setName('Email address')
          .setDesc('Email address for the mail.tm mailbox.')
          .addEmail((emailComponent) => {
            emailComponent.setDisabled(isRegistered);
            this.bind(emailComponent, 'emailAddress');
          })
          .addExtraButton((button) => {
            button
              .setTooltip('Copy to clipboard')
              .setIcon('clipboard')
              .onClick(convertAsyncToSync(async () => {
                // eslint-disable-next-line n/no-unsupported-features/node-builtins -- navigator.clipboard is the Web Clipboard API, available in Obsidian's Electron renderer; the rule incorrectly flags it as a Node experimental builtin.
                await navigator.clipboard.writeText(this.pluginSettingsComponent.settings.emailAddress);
                new Notice('Email address copied to clipboard');
              }));
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Email password')
          .setDesc('Password for the mail.tm mailbox.')
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
                  new Notice('No email password found');
                  return;
                }
                // eslint-disable-next-line n/no-unsupported-features/node-builtins -- navigator.clipboard is the Web Clipboard API, available in Obsidian's Electron renderer; the rule incorrectly flags it as a Node experimental builtin.
                await navigator.clipboard.writeText(password);
                new Notice('Email password copied to clipboard');
              }));
          });
      })
      .addSettingEx((setting) => {
        setting
          .setName('Delete seen emails')
          .setDesc(createFragment((f) => {
            f.appendText('Whether to delete emails from the mailbox after being saved as notes.');
            f.createEl('br');
            f.appendText('⚠️ WARNING: deleted emails cannot be recovered.');
            f.createEl('br');
            f.appendText('⚠️ WARNING: even if the setting is disabled, the emails will be deleted after 7 days. See ');
            f.createEl('a', { href: 'https://github.com/mnaoumov/obsidian-email-to-vault#privacy--data-handling', text: 'Privacy & data handling' });
            f.appendText(' for details.');
          }))
          .addToggle((toggle) => {
            this.bind(toggle, 'shouldDeleteSeenEmails');
          });
      });
  }

  private displayProviderSelection(): void {
    new SettingGroupEx(this.containerEl)
      .setHeading('Provider')
      .addSettingEx((setting) => {
        setting
          .setName('Email provider')
          .setDesc('Select which email provider to use.')
          .addDropdown((dropdown) => {
            dropdown
              .addOption(EmailProviderType.MailTm, 'Mail.tm')
              .addOption(EmailProviderType.Imap, 'IMAP');
            this.bind(dropdown, 'emailProviderType', {
              onChanged: () => {
                this.displayLegacy();
              }
            });
          });
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
