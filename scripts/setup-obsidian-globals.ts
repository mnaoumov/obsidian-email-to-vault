import { strictProxy } from 'obsidian-dev-utils/strict-proxy';

// Integration tests run in Node.js, not Obsidian/jsdom.
// Mock the Obsidian globals so plugin code that uses activeWindow/activeDocument works.
Object.assign(globalThis, {
  activeDocument: strictProxy({}),
  activeWindow: strictProxy({ setTimeout: globalThis.setTimeout.bind(globalThis) })
});
