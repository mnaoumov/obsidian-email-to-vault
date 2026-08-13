# Settings

Open **Settings -> Community plugins -> Email to Vault** to configure the plugin. Each option below lists the setting key stored in the plugin's `data.json`. Which groups are visible depends on the selected provider (Mail.tm or IMAP).

## Provider

- `emailProviderType`
  - which provider to use: `Mail.tm` (disposable mailbox, desktop and mobile) or `IMAP` (your own server, desktop only). See [01 Create a mailbox](<./01 Create a mailbox.md>) and [02 IMAP mode](<./02 IMAP mode.md>).

## Account

- `emailAddress`
  - the mailbox address. In Mail.tm mode it is filled in when you register; in IMAP mode it is your login username.
- `emailPasswordSecretKey`
  - internal key under which your password is kept in Obsidian's secret storage (the password itself is never written to `data.json`).

## IMAP connection (IMAP mode only)

- `imapHost`
  - hostname of your mail server, e.g. `imap.gmail.com`.
- `imapPort`
  - server port, usually `993`.
- `imapTls`
  - use TLS/SSL for the connection.
- `imapMailbox`
  - the mailbox folder to read, e.g. `INBOX`.

## Fetching

- `emailCheckIntervalInMinutes`
  - how often the plugin checks for new mail, in minutes. Set to `0` to disable automatic checking and fetch only via the commands (see [03 Email notes and commands](<./03 Email notes and commands.md>)).
- `shouldMarkEmailsAsSeen`
  - flag each email as seen on the server after it is saved, so it is not imported again. Disable to leave mail untouched and track imported messages by date instead.
- `lastProcessedEmailTimestamp`
  - internal bookmark of the most recent email already imported (used when `shouldMarkEmailsAsSeen` is off).
- `shouldDeleteSeenEmails`
  - delete each email from the mailbox once it has been saved as a note.

## Note output

- `emailNotePathTemplate`
  - path/name template for saved notes. Default: `Emails/{{date:YYYY-MM-DD}} {{subject}}`.
- `emailNoteTemplate`
  - the content template for each note (frontmatter plus body and attachments).
- `shouldExtractForwardedEmail`
  - treat forwarded emails as direct messages by extracting the original sender, recipients, and subject.
- `shouldStripHiddenElements`
  - remove hidden HTML elements (`display:none`, `visibility:hidden`, `opacity:0`, `aria-hidden`) before converting the email to markdown.
