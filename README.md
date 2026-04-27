# Email to Vault

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/mnaoumov)
[![GitHub release](https://img.shields.io/github/v/release/mnaoumov/obsidian-email-to-vault)](https://github.com/mnaoumov/obsidian-email-to-vault/releases)
[![GitHub downloads](https://img.shields.io/github/downloads/mnaoumov/obsidian-email-to-vault/total)](https://github.com/mnaoumov/obsidian-email-to-vault/releases)
[![Coverage: 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/mnaoumov/obsidian-email-to-vault)

This is a plugin for [Obsidian](https://obsidian.md/) that syncs emails into your vault as notes. Create a free disposable mailbox with one click, or connect your own IMAP server (Gmail, Outlook, etc.). No backend or paid service required. Inspired by [`Save emails into Evernote`](<https://help.evernote.com/hc/en-us/articles/209005347-Save-emails-into-Evernote>) feature.

![settings](<./images/settings.png>)

![note](<./images/note.png>)

## Features

- **Two email modes** — use the built-in disposable mailbox (Mail.tm) or connect your own IMAP server
- **One-click mailbox creation** — get a dedicated email address instantly from the plugin settings (Mail.tm mode)
- **IMAP support** — connect to any IMAP-compatible email server such as Gmail, Outlook, or a self-hosted server (desktop only)
- **Completely free** — no paid service, no self-hosted server, no external account needed
- **Automatic sync** — the plugin periodically checks for new emails and saves them as notes
- **Full metadata preservation** — From, To, CC, Subject, Body, and Attachments are all captured
- **Works on desktop and mobile** (IMAP mode is desktop only)

## How it works

### Mail.tm mode (default)

1. Open the plugin settings and click **Create Mailbox** to generate your unique email address
2. Forward or send emails to that address
3. The plugin automatically fetches new emails and creates notes in your vault

### IMAP mode

1. Open the plugin settings and select **IMAP** as the email provider
2. Enter your IMAP server details (host, port, TLS) and credentials
   - For Gmail with 2FA, use an [App Password](https://myaccount.google.com/apppasswords)
3. The plugin connects to your mailbox, fetches new emails, and creates notes in your vault

> [!NOTE]
>
> IMAP mode is only available on desktop. On mobile devices, use Mail.tm instead.

## Privacy & data handling

### Mail.tm mode

> [!WARNING]
>
> Emails are routed through a third-party server [mail.tm].
>
> **Do not send sensitive information — use at your own risk.**

This plugin uses [mail.tm] as the email provider. Message contents, sender addresses, and attachments are processed on third-party infrastructure before reaching your vault. Known properties of the provider (according to their [FAQ](https://mail.tm/en/faq/)):

- Messages are retained for **up to 7 days** on [mail.tm] servers.
- [mail.tm] claims it does not store IP addresses, but does not publish its jurisdiction, governing law, or corporate location.
- No GDPR/CCPA compliance claim is made by the provider.

By using this plugin, you acknowledge that any information you send — including sensitive or private data — is transmitted at your own risk. The plugin author makes no warranties regarding the confidentiality, integrity, or availability of data handled by mail.tm.

### IMAP mode

In IMAP mode, the plugin connects directly to your email server. No data is routed through third-party services beyond your own email provider. Your IMAP password is stored in Obsidian's built-in secret storage.

## Installation

The plugin is not available in [the official Community Plugins repository](https://obsidian.md/plugins) yet.

### Beta versions

To install the latest beta release of this plugin (regardless if it is available in [the official Community Plugins repository](https://obsidian.md/plugins) or not), follow these steps:

1. Ensure you have the [BRAT plugin](https://obsidian.md/plugins?id=obsidian42-brat) installed and enabled.
2. Click [Install via BRAT](https://intradeus.github.io/http-protocol-redirector?r=obsidian://brat?plugin=https://github.com/mnaoumov/obsidian-email-to-vault).
3. An Obsidian pop-up window should appear. In the window, click the `Add plugin` button once and wait a few seconds for the plugin to install.

## Debugging

By default, debug messages for this plugin are hidden.

To show them, run the following command in the `DevTools Console`:

```js
window.DEBUG.enable('email-to-vault');
```

For more details, refer to the [documentation](https://github.com/mnaoumov/obsidian-dev-utils/blob/main/docs/debugging.md).

## Support

<!-- markdownlint-disable MD033 -->

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60" width="217"></a>

<!-- markdownlint-enable MD033 -->

## My other Obsidian resources

[See my other Obsidian resources](https://github.com/mnaoumov/obsidian-resources).

## License

© [Michael Naumov](https://github.com/mnaoumov/)

[mail.tm]: https://mail.tm/
