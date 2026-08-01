import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { defineObsidianPluginVitestConfig } from 'obsidian-dev-utils/script-utils/test-runners/vitest-config';

// The mail.tm integration suite reads its credentials from `.env`, which has to be loaded before the
// Config is built. Plain module-level code rather than a hook: nothing about it belongs to the config.
if (existsSync('.env')) {
  loadEnvFile();
}

export const config = defineObsidianPluginVitestConfig();
