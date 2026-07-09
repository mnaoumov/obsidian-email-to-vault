# CLAUDE.md

## Project Overview

`obsidian-email-to-vault` — An Obsidian plugin that lets users create a free email mailbox with one click and automatically syncs incoming emails as notes in their vault. Inspired by Evernote's "email to notebook" feature.

## Key Design Decisions

### Plugin Name

- **Repo**: `obsidian-email-to-vault`
- **Display name**: TBD (e.g., "Email to Vault", "Mail to Vault")
- Checked for conflicts — no existing plugin uses this name
- Existing similar plugins (all have significant drawbacks our plugin avoids):
  - `obsidian-email-to-note` (OliverStaub) — empty repo, no implementation
  - `obsidian-email-plugin` (vault-bridges) — requires self-hosted SMTP server
  - `email2obsidian` (marr00n) — requires paid email2obsidian.com service
  - `obsidian-email-to-para` (mriechers) — only syncs starred/flagged from Gmail/Outlook

### Core Differentiators

1. **Free** — no paid service or backend required
2. **One-click mailbox creation** — no external setup needed

### Email Backend

- Uses [Mail.tm free API](https://docs.mail.tm/)
  - No API key required
  - REST API for: creating mailboxes, polling messages, fetching content
  - Completely free, no paid tiers

### Architecture (Planned)

1. User clicks "Create Mailbox" in plugin settings → calls Mail.tm API → gets address like `user123@mail.tm`
2. Plugin stores credentials in plugin settings (encrypted)
3. Plugin periodically polls Mail.tm for new emails
4. New emails are saved as markdown notes in a configured vault folder

### Caveats

- Disposable email domains may be blocked by some senders — fine for personal forwarding use case

### Known Limitations

- **Layout tables are unwrapped; only flat data tables survive**: Before converting to markdown, the plugin classifies each `<table>`. Layout tables (marked `role="presentation"`, lacking `<th>` header cells, or containing a nested `<table>`) are unwrapped — their cell content is preserved but the tabular structure is dropped — because Obsidian's turndown cannot handle nested layout tables (produces garbage escaped pipes). A table is only kept intact as a real markdown table when it is a genuine **data table**: not `role="presentation"`, has at least one `<th>`, and contains no nested `<table>`. A data table nested inside a layout table is preserved (the outer layout wrapper is unwrapped around it). Remaining limitation: a data table that itself contains a nested `<table>` is treated as a layout container and unwrapped, so its structure is lost.
- **"Mark emails as seen" off uses a date bookmark, which can drop same-second mail**: When `shouldMarkEmailsAsSeen` is off (and `shouldDeleteSeenEmails` is off), the plugin does not flag emails as seen on the server. Instead it tracks already-imported mail with a single `lastProcessedEmailTimestamp` bookmark and, on each poll, imports only emails whose `createdAt` is strictly greater than the bookmark. The first poll in this mode (empty bookmark) falls back to seen-based selection so it does not re-import the whole mailbox, then initializes the bookmark to the newest existing email's `createdAt`. Consequences: an email arriving in the exact same second as the last processed one may be skipped; the single bookmark is shared across providers, so switching provider (IMAP ↔ Mail.tm) can skip or re-import until the bookmark is caught up. This trade-off was chosen deliberately over a per-message processed-ID set.

## Current Task

None.
