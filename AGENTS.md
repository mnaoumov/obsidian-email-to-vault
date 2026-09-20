# AGENTS.md

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
- **An IMAP email whose `Date` header cannot be read is dated by the server's receipt time instead**: imapflow hands back `envelope.date` as a `Date` when it could parse the header and as the raw header string when it could not, so the desktop IMAP provider parses whatever it gets; when nothing parses it falls back to `internalDate`, the INTERNALDATE the server recorded when it accepted the message, which both fetch queries ask for. **That changes what `createdAt` MEANS for such a message** — receipt time, not send time — so its `{{date}}` can differ from the header a reader would see in another client, and it orders among the other messages by arrival. That is deliberate: the alternative is not a cosmetic gap. `createdAt` is compared lexicographically against the last-processed bookmark (see the next bullet), an empty string loses that comparison to every real timestamp, and so with "Mark emails as seen" off an undated message would never be imported at all rather than merely imported undated. Passing the raw header through instead is worse again — a non-ISO value sorts against real timestamps arbitrarily. An empty `createdAt` now survives only for a message with neither a readable header nor an internal date, which a real server should not produce. Real mail from a real server parses its header anyway — this is the malformed-header path, not the common one.
- **"Mark emails as seen" off uses a date bookmark, which can drop same-second mail**: When `shouldMarkEmailsAsSeen` is off (and `shouldDeleteSeenEmails` is off), the plugin does not flag emails as seen on the server. Instead it tracks already-imported mail with a single `lastProcessedEmailTimestamp` bookmark and, on each poll, imports only emails whose `createdAt` is strictly greater than the bookmark. The first poll in this mode (empty bookmark) falls back to seen-based selection so it does not re-import the whole mailbox, then initializes the bookmark to the newest existing email's `createdAt`. Consequences: an email arriving in the exact same second as the last processed one may be skipped; the single bookmark is shared across providers, so switching provider (IMAP ↔ Mail.tm) can skip or re-import until the bookmark is caught up. This trade-off was chosen deliberately over a per-message processed-ID set.

## Testing notes

### Both capture suites wait on live mail, and that wait can exceed their budget

Every frame that photographs a delivered email spends nearly the whole per-test budget (`CAPTURE_TEST_TIMEOUT_IN_MILLISECONDS`, 180 s in `scripts/vitest-config.ts`) waiting on a real message: sent over SMTP by the `.env` account, delivered to the disposable Mail.tm mailbox, then fetched by the plugin. **Measured on 2026-09-20, that delivery took 261 s** — sent from the `.env` account to a Mail.tm mailbox and polled until it appeared, with the account creation and the token call both answering in under a second, so the whole 261 s was inbound delivery.

When it goes that way a capture run reports **three different-looking failures for one cause** and none of them names it: `1` and `2` die on a bare `Test timed out in 180000ms`, and `3` on `expected 2 to be greater than 2`, which is the same failure one step downstream — the two notes `1` and `2` should have produced never arrived. `4` and `5` pass, because neither waits on new mail. So before treating that shape as a regression, send one message to a Mail.tm mailbox by hand and time it; the suite is very likely fine and the mailbox service is slow today.

`registerMailbox` is NOT part of this: it was moved onto `pollInObsidian`, so a registration that fails says so with the service's own error rather than expiring as a transport timeout.

### The mobile screenshot capture suite

The mobile frames are captured by **two different routes**, and which route a frame takes is a decision about that frame rather than a style choice:

- **A frame whose subject is not a focused field captures the PAGE** (`captureObsidianScreenshot`), which is byte-reproducible: no status bar and no clock, so re-capturing an unchanged frame leaves no diff. A real phone shows no keyboard on such a screen either, so raising one would make the frame *less* true.
- **A frame whose subject IS a focused field captures the DEVICE** (`captureDeviceScreenshot`), with the soft keyboard raised first. A page capture cannot show a keyboard: it drives Appium in the WebView context, so it photographs the page, and the IME is a system window that is not part of the page. That left the command-palette frame as a search field over a large empty band, with the caption band — drawn across the bottom of the image — landing on the field and clipping the typed text. **The cost is that the switched frame is no longer byte-reproducible**, since the status-bar clock and the battery indicator are in it. Do not "fix" that churn by putting it back on the page capture, and do not switch the other frames over for consistency.
- **Raising the keyboard takes TWO things**, which is why both belong to `obsidian-integration-testing` rather than being copied in here. The AVD is built with a hardware keyboard attached, so Android suppresses the on-screen one entirely — `withSoftKeyboardEnabled` lifts that for the duration of a shot and restores the device exactly, including restoring a setting that had never been written, which takes a delete rather than a write. And a WebView will not ask for an IME on programmatic focus alone: `raiseSoftKeyboard` lands a real touch on the field and then proves geometrically that it lifted, because nothing in the page reports the keyboard — `innerHeight`, `visualViewport` and the modal container all keep their full height with it shown. A failure writes the device framebuffer and the device's own input-method state to `dist/screenshots/`, because a bare assertion failure here is unreadable.
- **A passing lift check is not the same as a good frame.** The check asks whether the FIELD moved clear of the bottom; it cannot tell you the keyboard covered the thing the shot is evidence for. So look at a switched frame, every time, rather than trusting the measurement alone.
- **The field it touches is read off the suite, not assumed.** The command palette renders `.prompt input`, which is not the `.prompt-input` a suggester renders.
