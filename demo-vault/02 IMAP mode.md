[Docs](https://github.com/mnaoumov/obsidian-email-to-vault/)

# IMAP mode

Instead of the disposable Mail.tm mailbox, you can connect Email to Vault directly to **your own** email account over IMAP — Gmail, Outlook, or any IMAP-compatible server. In this mode nothing is routed through a third party: the plugin talks straight to your mail server, and your password is kept in Obsidian's built-in secret storage.

> [!NOTE] Desktop only
>
> IMAP mode is available on desktop only. On mobile, use [[01 Create a mailbox]] (Mail.tm) instead.

## Try it

1. Open **Settings -> Community plugins -> Email to Vault**.
2. Under **Provider**, set **Email provider** to **IMAP**.
3. Fill in the **IMAP** group with your server details:
   - **Server host** — e.g. `imap.gmail.com`.
   - **Server port** — usually `993`.
   - **Use TLS** — leave enabled for a secure connection.
   - **Mailbox** — the folder to read, e.g. `INBOX`.
   - **Email address** — your login username.
   - **Email password** — your password. For Gmail with 2FA, create an [App password](https://myaccount.google.com/apppasswords) rather than using your account password.
4. Optionally enable **Delete seen emails** to remove each message from the server once it has been saved.
5. Run a fetch command (see [[03 Email notes and commands]]) or wait for the automatic check. Matching emails become notes in your vault.

## Notes

- A live connection to your mail server is required; if the plugin cannot reach the server or the credentials are wrong, the fetch fails with a notice and no notes are created.
- Your password never leaves your machine except to authenticate with your own mail server.
- Fine-tune how notes are named and formatted in [[03 Email notes and commands]] and [[04 Settings]].
