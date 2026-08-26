# Email notes and commands

Once a mailbox is configured (via [01 Create a mailbox](<./01 Create a mailbox.md>) or [02 IMAP mode](<./02 IMAP mode.md>)), Email to Vault turns each fetched message into a note. This note explains when fetching happens, the commands you can run, and where notes land.

## When emails are fetched

- **Automatically**
  - the plugin checks for new mail on a timer. The interval is controlled by the `emailCheckIntervalInMinutes` setting (default 10 minutes; set it to 0 to disable automatic checking). See [04 Settings](<./04 Settings.md>).
- **On demand**
  - run one of the commands below from the Command Palette (`Ctrl/Cmd+P`).

## Commands

- **Email to Vault: Check emails**
  - fetch any new, unseen emails and save them as notes. This is the same action the automatic timer performs.
- **Email to Vault: Redownload all emails**
  - re-import every email currently in the mailbox, even ones already saved.
- **Email to Vault: Redownload recent emails**
  - re-import recent emails, so you can recover a note you deleted without reprocessing the whole mailbox.
- **Email to Vault: Open settings**
  - jump straight to the plugin's settings tab.

## Where notes land and what they contain

- The note's location and file name come from the **Email note path template** (`emailNotePathTemplate`), which defaults to `Emails/{{date:YYYY-MM-DD}} {{subject}}`. So an email lands in the `Emails/` folder, named by its date and subject.
- The note's body comes from the **Email note template** (`emailNoteTemplate`), which by default writes the `from`, `to`, `cc`, `subject`, and `date` into frontmatter, followed by the email body and any attachments.
- Both templates support the variables `{{from}}`, `{{to}}`, `{{cc}}`, `{{subject}}`, `{{body}}`, `{{attachments}}`, and `{{date:FORMAT}}` (using [Moment.js format](https://momentjs.com/docs/#/displaying/format/)).

![An email saved as a note, with its metadata in frontmatter](<./_assets/images/note.png>)

## Try it

**Step 1 — get some mail.** Configure a mailbox and send yourself a test email. This part is genuinely yours - the plugin fetches real mail from a live service, so nothing here can stand in for it.

```code-button
---
caption: Open the plugin's settings (where Create Mailbox lives)
---
require('/demoSetup.ts').openPluginSettings(app);
```

**Step 2 — fetch.**

```code-button
---
caption: Check emails
---
require('/demoSetup.ts').checkEmails(app);
```

Manual equivalent: **Email to Vault: Check emails** in the Command Palette.

**Step 3.** Open the `Emails/` folder — your message is now a note.

Then change the note template and fetch again. Typing a multi-line template into a settings text area is the awkward part, so both of these are one press:

```code-button
---
caption: Use a short, readable note template
---
await require('/demoSetup.ts').useMinimalNoteTemplate(app);
```

```code-button
---
caption: Restore the shipped templates
---
await require('/demoSetup.ts').restoreDefaultTemplates(app);
```

Manual equivalent: edit **Email note template** and **Email note path template** in [04 Settings](<./04 Settings.md>).
