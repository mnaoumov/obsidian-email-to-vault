# Start here

Welcome to the [Email to Vault](https://github.com/mnaoumov/obsidian-email-to-vault/) demo vault. **Email to Vault** syncs emails into your vault as notes: create a free disposable mailbox with one click (Mail.tm), or connect your own IMAP server (Gmail, Outlook, etc.). The plugin periodically fetches new messages and saves each one as a note, preserving From, To, CC, Subject, Body, and Attachments.

> [!IMPORTANT] This demo needs your own mailbox
>
> Unlike most demo vaults, this feature cannot be pre-baked: it fetches real emails from a live mail service over the network. Nothing here sends or receives mail for you. The notes below walk you through the exact steps — creating or connecting an inbox, running a fetch command, and where the notes land — so you can configure **your own** account and try it. A network connection (and, for IMAP, your own email account) is required.

## Your first five minutes

The quickest route to a real email in this vault, with no account of your own:

1. Open the plugin's settings and click **Create Mailbox**. You get a disposable address instantly —
   no signup.

   ```code-button
   ---
   caption: Open the plugin's settings
   ---
   require('/demoSetup.ts').openPluginSettings(app);
   ```

2. Send an email to that address from anywhere. **This step is yours** — see the note above.
3. Fetch it:

   ```code-button
   ---
   caption: Check emails
   ---
   require('/demoSetup.ts').checkEmails(app);
   ```

4. A note appears carrying the From, To, CC, Subject, Body and any attachments.

That is the whole loop. [01 Create a mailbox](<./01 Create a mailbox.md>) walks it in detail; before
you point it at anything you care about, read
[05 Privacy and data handling](<./05 Privacy and data handling.md>) — the disposable mailbox routes your
mail through a third party, and your own IMAP server does not.

## Features

- [01 Create a mailbox](<./01 Create a mailbox.md>)
- [02 IMAP mode](<./02 IMAP mode.md>)
- [03 Email notes and commands](<./03 Email notes and commands.md>)
- [04 Settings](<./04 Settings.md>)
- [05 Privacy and data handling](<./05 Privacy and data handling.md>)
