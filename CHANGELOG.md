# CHANGELOG

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
- docs: drop per-plugin demo-vault setup notes (bootstrap covered by ODU harness)
- Merge branch 'T98': create the Email to Vault demo vault (S2)
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
