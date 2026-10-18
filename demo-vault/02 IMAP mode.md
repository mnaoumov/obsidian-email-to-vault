# IMAP mode

Instead of the disposable Mail.tm mailbox, you can connect `Email to Vault` directly to **your own** email account over IMAP — Gmail, Outlook, or any IMAP-compatible server. In this mode nothing is routed through a third party: the plugin talks straight to your mail server, and your password is kept in Obsidian's built-in secret storage.

> [!NOTE] Desktop only
>
> IMAP mode is available on desktop only. On mobile, use [01 Create a mailbox](<./01 Create a mailbox.md>) (Mail.tm) instead.

## Try it

**Step 1 — switch to IMAP and fill in the server.** Pick your provider's server; each button sets **Email provider** to **IMAP**, the **Server host**, port `993` with **Use TLS** on, and the `INBOX` mailbox.

```code-button
---
caption: Use IMAP with Gmail's server
---
await require('/demoSetup.ts').useImapServer(app, 'imap.gmail.com');
```

```code-button
---
caption: Use IMAP with Outlook's server
---
await require('/demoSetup.ts').useImapServer(app, 'outlook.office365.com');
```

**Step 2 — enter your login.** Open the settings and fill in **Email address** and **Email password**. **This step is yours**: the password goes into Obsidian's secret storage, and no button types it for you.

```code-button
---
caption: Open the plugin's settings
---
require('/demoSetup.ts').openPluginSettings(app);
```

**Step 3 (optional) — delete what you import.** Turn on **Delete seen emails** to remove each message from the server once it has been saved.

```code-button
---
caption: Turn on Delete seen emails
---
await require('/demoSetup.ts').setDeleteSeenEmails(app, true);
```

```code-button
---
caption: Turn off Delete seen emails
---
await require('/demoSetup.ts').setDeleteSeenEmails(app, false);
```

**Step 4 — fetch.** Matching emails become notes in your vault.

```code-button
---
caption: Check emails
---
require('/demoSetup.ts').checkEmails(app);
```

**Reset.** Go back to the disposable Mail.tm mailbox, with **Delete seen emails** off:

```code-button
---
caption: Switch back to Mail.tm
---
await require('/demoSetup.ts').useMailTmProvider(app);
```

### Manual equivalent

1. Open **Settings -> Community plugins -> `Email to Vault`**.
2. Under **Provider**, set **Email provider** to **IMAP**.
3. Fill in the **IMAP** group with your server details:
   - **Server host**
     - e.g. `imap.gmail.com`.
   - **Server port**
     - usually `993`.
   - **Use TLS**
     - leave enabled for a secure connection.
   - **Mailbox**
     - the folder to read, e.g. `INBOX`.
   - **Email address**
     - your login username.
   - **Email password**
     - your password. For Gmail with 2FA, create an [App password](https://myaccount.google.com/apppasswords) rather than using your account password.
4. Optionally enable **Delete seen emails** to remove each message from the server once it has been saved.
5. Run a fetch command (see [03 Email notes and commands](<./03 Email notes and commands.md>)) or wait for the automatic check. Matching emails become notes in your vault.

## Notes

- A live connection to your mail server is required; if the plugin cannot reach the server or the credentials are wrong, the fetch fails with a notice and no notes are created.
- Your password never leaves your machine except to authenticate with your own mail server.
- Fine-tune how notes are named and formatted in [03 Email notes and commands](<./03 Email notes and commands.md>) and [04 Settings](<./04 Settings.md>).
