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
