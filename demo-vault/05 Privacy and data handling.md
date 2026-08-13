# Privacy and data handling

This plugin moves your email into your vault, so it is worth being precise about who sees that mail on
the way. The answer is entirely different for the two modes, and the difference is the main reason to
pick one over the other.

## Mail.tm mode

> [!WARNING]
>
> Emails are routed through a third-party server [mail.tm].
>
> **Do not send sensitive information — use at your own risk.**

Message contents, sender addresses and attachments are processed on third-party infrastructure before
they reach your vault. Known properties of the provider, according to their
[FAQ](https://mail.tm/en/faq/):

- Retention
  - messages are kept for **up to 7 days** on [mail.tm] servers.
- IP addresses
  - [mail.tm] claims it does not store them, but publishes no jurisdiction, governing law or corporate
    location.
- Compliance
  - no GDPR/CCPA compliance claim is made by the provider.

By using this plugin in Mail.tm mode you accept that anything you send — including sensitive or private
data — is transmitted at your own risk. No warranty is made about the confidentiality, integrity or
availability of data handled by mail.tm.

This mode exists because it needs nothing from you: no account, no server, no configuration. That
convenience is exactly what you are trading the privacy for, which is why it is the mode to use for
throwaway captures and not for anything you would mind a stranger reading.

## IMAP mode

The plugin connects **directly** to your own email server. Nothing is routed through any third party
beyond the email provider you already chose. Your IMAP password is stored in Obsidian's built-in secret
storage rather than in the plugin's settings file.

If the mail matters, this is the mode to use — see
[02 IMAP mode](<./02 IMAP mode.md>). It is desktop only.

[mail.tm]: https://mail.tm/
