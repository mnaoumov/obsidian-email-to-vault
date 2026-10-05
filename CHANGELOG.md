# CHANGELOG

## 2.3.10

- fix(settings): merge the retired Mail.tm domain and secret key fixes
- fix(settings): merge the second-device Mail.tm password entry

## 2.3.9

- test(screenshots): merge the applyObsidianTheme desktop capture theme
- test(forward): merge the macOS Outlook forward header test

## 2.3.8

- chore(cspell): merge the lintable dictionary word
- test(screenshots): merge the harness-side caret hiding
- test(screenshots): merge the hidden palette caret for frame 5
- chore(deps): merge the obsidian-integration-testing ^17 float and the re-shot frames
- fix(forward): merge the localized and HTML Outlook forward headers
- fix(mail-tm): merge the missing-body-fields default
- chore(deps): merge the obsidian-test-mocks ^7.0.0 float
- fix(test): merge the headless demo-vault toolkit install
- chore: adopt the npm run gate branch gate
- fix(deps): restore the lockfile's missing resolved and integrity fields
- docs(contributing): name the default branch contributors should base a PR on
- fix(screenshots): size both capture waits above live mail, and make each wait report itself
- style(screenshots): silence the sharp no-named-as-default warning in both capture suites
- fix(imap): fall back to the server internal date when the Date header cannot be read
- docs(agents): record that a capture run can fail three ways on one slow mail delivery
- test(screenshots): move registerMailbox onto pollInObsidian in both capture suites
- test(vitest-config): run the window-stubbing email-checker suite on the default pool
- fix(imap): read an envelope date imapflow 2 could not parse itself
- fix(deps): float devalue to 5.9.4, clearing GHSA-9rgm-9g3h-6x36
- test: open both mailbox notes on the exact marker line
- test: bring the desktop capture render ceiling in line, and say what the mailbox wait costs
- build(markdownlint): forbid hard-wrapped markdown paragraphs
- chore(deps): drop the dead markdown-it override
- chore(deps): drop the dead js-yaml override
- fix(deps): override smol-toml to clear a denial-of-service advisory
- style(comments): stop capitalizing the middle of a wrapped comment
- docs: replace the private rule-id citations with what they assert
- test: run the mobile file-drawer retry from Node, so its own diagnostic can fire
- docs: name the library and the sibling plugins so a reader can resolve them
- docs: replace the private tracker references with what they pointed at
- test(integration): take the palette frame with the soft keyboard up
- test: size openNote's wait ceiling under the cap, and drop the disable it needed
- refactor: use the shared Templates language component from obsidian-dev-utils
- refactor(android): drive the Android suites with trusted input
- docs: name the unversioned demo-vault asset and the folder it unzips into
- chore: make the LICENSE copyright line lintable and guard it against the year roll-over
- test(test-mocks): drop the app.plugins stub, and sweep the dependencies
- fix(build): wire build:compile to buildCompile and drop the duplicate leaf script

## 2.3.7

- chore(deps): sweep caret-ranged dependencies to latest
- fix(deps): move to obsidian-integration-testing 11 and obsidian-dev-utils 96.5.2
- fix(deps): drop the brace-expansion file: override that breaks a clean install

## 2.3.6

- test(email-to-vault): dismiss a leftover palette with a trusted Escape on desktop

## 2.3.5

- docs(demo-vault): unwrap the notes so Obsidian stops rendering a break per line
- docs(readme): render the same in Obsidian's plugin page as on GitHub
- chore: update libs
- test: unblock the no-app integration suite by bypassing nodemailer's c-ares DNS
- chore: update obsidian-dev-utils to 94.6.1
- chore: update obsidian-dev-utils to 94.6.0
- fix: override deepmerge-ts to clear GHSA-ggr8-5vv4-36mx
- test: gate the demo vault by clicking every code button
- chore: teach cspell the advisory wording
- chore: update libs
- docs(demo-vault): give the demo vault its code buttons
- docs: add store screenshots and surface them in the README

## 2.3.4

- docs: make the demo vault the documentation, in the standard layout
- feat(demo-vault): migrate to obsidian-dev-utils 93.3.1 and adopt the authoring convention

## 2.3.3

- chore: update libs and adopt obsidian-integration-testing 10

## 2.3.2

- fix: await the settings load before the email provider manager

## 2.3.1

- chore: update libs
- chore: update libs
- chore(vitest): adopt the shared Obsidian plugin vitest configuration
- refactor(prism): register the template language through obsidian-dev-utils' SyntaxHighlightingComponent

## 2.3.0

- fix: unblock the release gate
- refactor(settings): move the settings tab onto the declarative settings API
- chore: update libs and clear the npm audit
- docs: fix the demo vault download instructions

## 2.2.1

- chore: update libs

## 2.2.0

- feat: re #5
- chore: update libs

## 2.1.4

- chore: update libs

## 2.1.3

- chore: update libs
- chore(demo-vault): drop committed Invocables placeholder
- fix(demo-vault): export invoke() from startup script; add Invocables folder

## 2.1.2

- docs: standardize demo-vault README
- docs: drop per-plugin demo-vault setup notes (bootstrap covered by the obsidian-dev-utils harness)
- docs(demo-vault): create the Email to Vault demo vault
- chore: update libs
- docs: update
- docs: migrate to AGENTS.md

## 2.1.1

- chore: update libs
- chore: update obsidian-dev-utils to 85.0.0
- refactor: pass params objects to email providers and note-creator helpers

## 2.1.0

- feat: re #6
- test: wire integration-testing vitest-setup into integration projects
- chore: update libs
- chore: clean up tsconfig

## 2.0.8

- refactor: new template

## 2.0.7

- chore: update libs

## 2.0.6

- chore: update libs
- chore: upgrade dependencies and green up all checks

## 2.0.5

- chore: update template

## 2.0.4

- fix(test): update expected addChild count to match 7 children in Plugin constructor
- refactor: migrate to @obsidian-typings/obsidian-public-latest
- chore: update libs
- build: replace commitizen with czg
- chore: add attestation
- docs: add contributing

## 2.0.3

- refactor: new template

## 2.0.2

- chore: update libs

## 2.0.1

- refactor: new template
- chore: separate integration tests

## 2.0.0

- feat: add generic IMAP provider (Desktop only)

## 1.2.0

- test: achieve 100% coverage
- docs: document known limitation of table stripping
- refactor: always strip layout tables
- feat: add settings for table stripping and hidden element removal
- fix: sanitize email HTML before passing to turndown

## 1.1.3

- chore: update libs

## 1.1.2

- refactor: extract Obsidian globals mock into separate setup file
- fix: mock activeWindow/activeDocument
- refactor: new template

## 1.1.1

- fix: build
- test: add date format expansion test for content template
- refactor: unify template filling with fillTemplate

## 1.1.0

- chore: lint
- chore: avoid unnecessary config override
- chore: update libs
- docs: update settings screenshot
- refactor: toggle register/unregister button
- refactor: use Obsidian components in redownload modal
- feat: allow manual entry of mail.tm credentials
- feat: add mail.tm info description to settings page

## 1.0.1

- refactor: make mobile-friendly string generators
- chore: update libs, remove non-mobile-friendly ones

## 1.0.0

- feat: initial release
