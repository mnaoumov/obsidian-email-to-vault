# Create a mailbox (Mail.tm)

The quickest way to try Email to Vault is the built-in **Mail.tm** provider: a free, disposable mailbox you create with one click, with no account, backend, or paid service.

> [!WARNING] Mail.tm is a third-party service
>
> Messages are routed through [mail.tm](https://mail.tm/) and retained there for up to 7 days. **Do not send sensitive information.** See the plugin's [Privacy & data handling](https://github.com/mnaoumov/obsidian-email-to-vault#privacy--data-handling) section for details.

## Try it

1. Open **Settings -> Community plugins -> Email to Vault**.
2. Under **Provider**, leave **Email provider** set to **Mail.tm** (the default).
3. In the **Mail.tm** group, click **Register new random email address**. The plugin asks mail.tm for a fresh address and fills in the **Email address** field. This step needs a network connection.
4. Copy the address with the clipboard button next to it, and send or forward a test email to it from any mail client.
5. Wait for the automatic check (see [03 Email notes and commands](<./03 Email notes and commands.md>)), or run the fetch command yourself. New emails become notes in your vault.

## Notes

- The generated address and its password are stored in the plugin settings so the plugin can keep polling the mailbox. You can copy either to the clipboard, or click **Unregister email address** to discard the mailbox.
- Mail.tm works on both desktop and mobile.
- Prefer your own email account instead? See [02 IMAP mode](<./02 IMAP mode.md>).
- To change where notes are created and what they contain, see [03 Email notes and commands](<./03 Email notes and commands.md>) and [04 Settings](<./04 Settings.md>).
