# CHANGELOG

## 2.4.1

This release has 2 fixes and 4 documentation changes. 4 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- skip a scheduled email check that cannot reach the server
- **deps:** clear the glob cancellation advisory with a glob 14 override

### Documentation

- **changelog:** regroup the published release notes for readers
- note that an unreachable server skips a scheduled check
- make issue attachments optional and strongly encouraged
- link to the Obsidian resources page

## 2.4.0

This release has 1 new feature and 2 documentation changes. 5 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- add a Report a bug command

### Documentation

- **readme:** point bug reports at the Report a bug command
- add issue-filing instructions for AI agents

## 2.3.13

This release has 2 fixes and 10 documentation changes. 15 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- \[BUG\] CustomStackTraceError / Command failed when checking an empty mailbox (#11)
- \[BUG\] "The email address domain is not a valid Mail.tm domain" (#10)

### Documentation

- **readme:** combine related resources and plugin comparisons
- **readme:** add a Similar plugins section
- name `obsidian-lib` where comments said dev-utils
- shorten the debugging section
- **changelog:** escape the issue-title tags so `markdownlint` and `cspell` pass
- **changelog:** name the issue each released entry resolved
- **readme:** lead the Debugging section with `Advanced Debug Mode`
- mark plugin names as code
- **demo-vault:** add code buttons to the Mail.tm and IMAP Try it sections
- merge marking plugin names as code in prose and comments

## 2.3.12

This release has 1 fix.

### Fixed

- **settings:** merge the Mail.tm credential typing and unregister fixes (re #10 - \[BUG\] "The email address domain is not a valid Mail.tm domain")

## 2.3.11

This release has 1 fix.

### Fixed

- **settings:** merge the invalid password secret key fix (re #10 - \[BUG\] "The email address domain is not a valid Mail.tm domain")

## 2.3.10

This release has 2 fixes.

### Fixed

- **settings:** merge the retired Mail.tm domain and secret key fixes (re #10 - \[BUG\] "The email address domain is not a valid Mail.tm domain")
- **settings:** merge the second-device Mail.tm password entry

## 2.3.9

This release has maintenance changes only. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 2.3.8

This release has 10 fixes and 6 documentation changes. 22 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **forward:** merge the localized and HTML Outlook forward headers (re #9 - \[BUG\] Extract forward email doesn't extract emails + Feature request)
- **mail-tm:** merge the missing-body-fields default (re #8 - Issue when using Epson scan to cloud)
- **test:** merge the headless demo-vault toolkit install
- **deps:** restore the lockfile's missing resolved and integrity fields
- **screenshots:** size both capture waits above live mail, and make each wait report itself
- **imap:** fall back to the server internal date when the Date header cannot be read
- **imap:** read an envelope date imapflow 2 could not parse itself
- **deps:** float devalue to 5.9.4, clearing GHSA-9rgm-9g3h-6x36
- **deps:** override smol-toml to clear a denial-of-service advisory
- **build:** wire build:compile to buildCompile and drop the duplicate leaf script

### Documentation

- **contributing:** name the default branch contributors should base a PR on
- **agents:** record that a capture run can fail three ways on one slow mail delivery
- replace the private rule-id citations with what they assert
- name the library and the sibling plugins so a reader can resolve them
- replace the private tracker references with what they pointed at
- name the unversioned demo-vault asset and the folder it unzips into

## 2.3.7

This release has 2 fixes. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- **deps:** move to `obsidian-integration-testing` 11 and `obsidian-dev-utils` 96.5.2
- **deps:** drop the brace-expansion file: override that breaks a clean install

## 2.3.6

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.3.5

This release has 1 fix and 4 documentation changes. 7 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- override deepmerge-ts to clear GHSA-ggr8-5vv4-36mx

### Documentation

- **demo-vault:** unwrap the notes so Obsidian stops rendering a break per line
- **readme:** render the same in Obsidian's plugin page as on `GitHub`
- **demo-vault:** give the demo vault its code buttons
- add store screenshots and surface them in the README

## 2.3.4

This release has 1 new feature and 1 documentation change.

### New

- **demo-vault:** migrate to `obsidian-dev-utils` 93.3.1 and adopt the authoring convention

### Documentation

- make the demo vault the documentation, in the standard layout

## 2.3.3

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.3.2

This release has 1 fix.

### Fixed

- await the settings load before the email provider manager

## 2.3.1

This release has maintenance changes only. 4 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 2.3.0

This release has 1 fix and 1 documentation change. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- unblock the release gate

### Documentation

- fix the demo vault download instructions

## 2.2.1

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.2.0

This release has 1 new feature. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### New

- \[FR\] feat: add options to strip special characters that break link functionality (#5)

## 2.1.4

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.1.3

This release has 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **demo-vault:** export invoke() from startup script; add Invocables folder

## 2.1.2

This release has 5 documentation changes. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Documentation

- standardize demo-vault README
- drop per-plugin demo-vault setup notes (bootstrap covered by the `obsidian-dev-utils` harness)
- **demo-vault:** create the `Email to Vault` demo vault
- update
- migrate to AGENTS.md

## 2.1.1

This release has maintenance changes only. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 2.1.0

This release has 1 new feature. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- \[FR\] Add option to settings to control the behavior of emails being flagged as "Seen" through IMAP (#6)

## 2.0.8

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.0.7

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.0.6

This release has maintenance changes only. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 2.0.5

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.0.4

This release has 1 fix and 1 documentation change. 4 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **test:** update expected addChild count to match 7 children in Plugin constructor

### Documentation

- add contributing

## 2.0.3

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.0.2

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.0.1

This release has maintenance changes only. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 2.0.0

This release has 1 new feature.

### New

- add generic IMAP provider (Desktop only)

## 1.2.0

This release has 1 new feature, 1 fix and 1 documentation change. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- add settings for table stripping and hidden element removal

### Fixed

- sanitize email HTML before passing to turndown

### Documentation

- document known limitation of table stripping

## 1.1.3

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 1.1.2

This release has 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- mock activeWindow/activeDocument

## 1.1.1

This release has 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- build

## 1.1.0

This release has 2 new features and 1 documentation change. 5 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- allow manual entry of mail.tm credentials
- add mail.tm info description to settings page

### Documentation

- update settings screenshot

## 1.0.1

This release has maintenance changes only. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 1.0.0

This release has 1 new feature.

### New

- initial release
