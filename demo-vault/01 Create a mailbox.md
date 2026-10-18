# Create a mailbox (Mail.tm)

The quickest way to try `Email to Vault` is the built-in **Mail.tm** provider: a free, disposable mailbox you create with one click, with no account, backend, or paid service.

> [!WARNING] Mail.tm is a third-party service
>
> Messages are routed through [mail.tm](https://mail.tm/) and retained there for up to 7 days. **Do not send sensitive information.** See the plugin's [05 Privacy and data handling](<./05 Privacy and data handling.md>) for details.

![The plugin's settings, with the Mail.tm provider selected](<./_assets/images/settings.png>)

## Try it

**Step 1 — pick Mail.tm.** It is the default, so this only matters if you switched to IMAP in [02 IMAP mode](<./02 IMAP mode.md>).

```code-button
---
caption: Use the Mail.tm provider
---
await require('/demoSetup.ts').useMailTmProvider(app);
```

Manual equivalent: open **Settings -> Community plugins -> `Email to Vault`**, and under **Provider** set **Email provider** to **Mail.tm**.

**Step 2 — register an address.** Open the settings, and in the **Mail.tm** group click **Register new random email address**. The plugin asks mail.tm for a fresh address and fills in the **Email address** field. This step needs a network connection, and it stays a click in the settings rather than a button here, because it creates a real mailbox on a third-party service.

```code-button
---
caption: Open the plugin's settings
---
require('/demoSetup.ts').openPluginSettings(app);
```

**Step 3 — send it something.** Copy the address with the clipboard button next to it, and send or forward a test email to it from any mail client. **This step is yours** — no button can produce an email for you.

**Step 4 — fetch.** Wait for the automatic check (see [03 Email notes and commands](<./03 Email notes and commands.md>)), or fetch now:

```code-button
---
caption: Check emails
---
require('/demoSetup.ts').checkEmails(app);
```

Manual equivalent: **`Email to Vault`: Check emails** in the Command Palette. New emails become notes in your vault.

## Notes

- The generated address is stored in the plugin settings, and its password in Obsidian's secret storage, so the plugin can keep polling the mailbox. You can copy either to the clipboard, or click **Unregister email address** to discard the mailbox.
- **Using the vault on more than one device?** The address travels with the vault's settings, but the password stays on the device that created the mailbox. On each other device, open the settings, copy the password on the first device with its clipboard button, and paste it into the **Email password** field, which stays editable until that device has a password.
- Mail.tm works on both desktop and mobile.
- Prefer your own email account instead? See [02 IMAP mode](<./02 IMAP mode.md>).
- To change where notes are created and what they contain, see [03 Email notes and commands](<./03 Email notes and commands.md>) and [04 Settings](<./04 Settings.md>).
