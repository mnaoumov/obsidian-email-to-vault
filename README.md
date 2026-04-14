# Email to Vault

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/mnaoumov)
<!-- TODO: Uncomment after first GitHub release
[![GitHub release](https://img.shields.io/github/v/release/mnaoumov/obsidian-email-to-vault)](https://github.com/mnaoumov/obsidian-email-to-vault/releases)
[![GitHub downloads](https://img.shields.io/github/downloads/mnaoumov/obsidian-email-to-vault/total)](https://github.com/mnaoumov/obsidian-email-to-vault/releases)
-->

This is a plugin for [Obsidian](https://obsidian.md/) that creates a free email mailbox with one click, so you can forward emails to your vault as notes. No backend or paid service required. Inspired by Evernote's `email to notebook` feature.

## Features

- **One-click mailbox creation** — get a dedicated email address instantly from the plugin settings
- **Completely free** — no paid service, no self-hosted server, no external account needed
- **Automatic sync** — the plugin periodically checks for new emails and saves them as notes
- **Full metadata preservation** — From, To, CC, BCC, Subject, Body, and Attachments are all captured
- **Works on desktop and mobile**

## How it works

1. Open the plugin settings and click **Create Mailbox** to generate your unique email address
2. Forward or send emails to that address
3. The plugin automatically fetches new emails and creates notes in your vault

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
