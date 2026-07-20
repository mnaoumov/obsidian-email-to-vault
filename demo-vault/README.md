# Email to Vault demo vault

A small Obsidian vault that demonstrates the [Email to Vault](https://github.com/mnaoumov/obsidian-email-to-vault) plugin - it syncs emails into your vault as notes, either from a one-click disposable Mail.tm mailbox or from your own IMAP server.

Open [00 Start](<./00 Start.md>) and follow the notes. Because the feature fetches real emails from a live mail service, this demo cannot be pre-baked: the notes walk you through configuring **your own** mailbox (Mail.tm or IMAP), running a fetch command, and seeing where the resulting notes land. A network connection (and, for IMAP, your own email account) is required.

## First open

The first time you open this vault, Obsidian treats it as **untrusted**, so the bundled plugins are listed but not loaded until you **Trust author and enable plugins** and reload. After that, the Demo Vault Helper installs [CodeScript Toolkit](https://github.com/mnaoumov/obsidian-codescript-toolkit) (which powers the optional **Run** buttons in the setup notes) and opens the start note for you.
