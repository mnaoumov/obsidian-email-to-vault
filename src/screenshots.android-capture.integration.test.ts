/**
 * @file
 *
 * Produces the mobile screenshots the community-store listing needs,
 * driving REAL email through Obsidian Mobile on a real Android emulator and
 * writing `images/screenshots/screenshot-mobile-N.png`.
 *
 * Worth taking on a phone rather than reusing the desktop set: Mail.tm mode is
 * the mode that WORKS on a phone (IMAP is desktop-only), and a reader deciding
 * whether their mail can reach their pocket vault is answered by seeing it there.
 *
 * Nothing here is staged. The plugin creates its own disposable Mail.tm mailbox
 * through the very method its settings button calls; the emails are sent over
 * SMTP by the same account the plugin's live integration suite uses; and the
 * notes in frame are the notes the plugin wrote when it fetched them. A vault
 * pre-filled with hand-written "email notes" would photograph the same and prove
 * nothing, which is the one thing this plugin's screenshots must not do.
 *
 * That makes the suite dependent on two live services. It is the only honest
 * option: this plugin's whole subject is mail arriving from outside, and its own
 * demo vault says as much — it is the author's one demo vault that cannot pre-bake
 * its feature.
 *
 * The sender address is whatever `SMTP_USER` is in `.env`, so it appears in the
 * From line of every frame.
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { createTransport } from 'nodemailer';
import { sleep as sleepInNode } from 'obsidian-dev-utils/async';
import {
  captureDeviceScreenshot,
  captureObsidianScreenshot,
  ContextId,
  evalInObsidian,
  labelScreenshot,
  pollInObsidian,
  raiseSoftKeyboard,
  readPngDimensions,
  resolveEmulatorDeviceId,
  withSoftKeyboardEnabled
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
// eslint-disable-next-line import-x/no-named-as-default -- sharp's ESM entry exports only the default; the named `sharp` the rule points at exists in the typings alone, where it is the very binding the default re-exports. `import { sharp } from 'sharp'` therefore typechecks and then throws `does not provide an export named 'sharp'` at runtime.
import sharp from 'sharp';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

import {
  DELIVERY_BUDGET_IN_MILLISECONDS,
  REDOWNLOAD_BUDGET_IN_MILLISECONDS
} from '../scripts/capture-timings.ts';

/**
 * A file-explorer row, reduced to the collapse toggle.
 */
interface CollapsibleFileItem {
  collapsed?: boolean;
  setCollapsed?: (this: void, isCollapsed: boolean) => Promise<void>;
}

/**
 * What one drawer attempt saw.
 *
 * `isOpen` is what the Node-side `until` accepts on; the other two are the facts
 * the failure message is built from, carried out of Obsidian on every attempt so
 * the LAST of them is still in hand when the budget runs out.
 */
interface DrawerAttempt {
  collapsed: boolean;
  display: string;
  isOpen: boolean;
}

/**
 * The file-explorer view, reduced to its rows.
 */
interface FileExplorerView {
  fileItems: Record<string, CollapsibleFileItem>;
}

/**
 * `App`, reduced to the font-size applier that `obsidian-typings` does not
 * declare. Setting `baseFontSize` alone changes nothing on screen.
 */
interface FontSizeApp {
  updateFontSize: (this: void) => void;
}

/**
 * `App`, reduced to the inline-title toggle that `obsidian-typings` does not
 * declare. Setting the config alone changes nothing on screen.
 */
interface InlineTitleApp {
  updateInlineTitleDisplay: (this: void) => void;
}

const WIDTH_IN_PIXELS = 900;
const HEIGHT_IN_PIXELS = 1600;

const PLUGIN_ID = 'email-to-vault';

const EMAILS_FOLDER = 'Emails';

/**
 * The three messages the storyboard sends, in order. Ordinary mail on purpose —
 * a receipt, a confirmation and something with a file attached — because that is
 * what a reader is imagining when they read the listing.
 */
const RECEIPT_SUBJECT = 'Your order 4471 has shipped';
const BOOKING_SUBJECT = 'Booking confirmed: 14 March, 19:30';
const ATTACHMENT_SUBJECT = 'Invoice for March';
const ATTACHMENT_FILE_NAME = 'invoice-march.png';

/**
 * What shot 4 changes the templates to: a different folder, a different file
 * name, and frontmatter of the reader's own choosing.
 */
const CUSTOM_TEMPLATE_FOLDER = 'Inbox';
const CUSTOM_TEMPLATE_PATH_TEMPLATE = `${CUSTOM_TEMPLATE_FOLDER}/{{date:YYYY-MM}}/{{subject}}`;
const CUSTOM_TEMPLATE_NOTE_TEMPLATE = [
  '---',
  'tags:',
  '  - inbox/email',
  'sender: "{{from}}"',
  'received: {{date}}',
  '---',
  '',
  '# {{subject}}',
  '',
  '{{body}}',
  '',
  '{{attachments}}',
  ''
].join('\n');

/**
 * Base font size for the mobile shots.
 *
 * Below Obsidian's own 16px default: the screenshot AVD is a 450x800 dp screen,
 * on which an email subject in a file name wraps at 16.
 */
const MOBILE_FONT_SIZE_IN_PIXELS = 13;

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

/**
 * The mailbox the plugin creates for itself, filled in by `beforeAll`.
 */
let mailboxAddress = '';

/**
 * The AVD the frames are taken on, matched by name.
 *
 * Never the first device `adb devices` lists: a physical phone is routinely plugged into the same
 * machine, and the shared AVD the cross-platform suites drive is a different size.
 */
const AVD_NAME = 'obsidian_screenshots';

/**
 * Obsidian's command palette input, read off this suite's own palette helper rather than assumed: the
 * palette renders `.prompt input`, which is not the `.prompt-input` a suggester renders.
 */
const PALETTE_INPUT_SELECTOR = '.prompt input';

let deviceId = '';

beforeAll(async () => {
  deviceId = await resolveEmulatorDeviceId({ avdName: AVD_NAME });

  const vault = getTemporaryVault();

  vault.populate({
    'Projects/Website redesign.md': '# Website redesign\n\nWaiting on the invoice.\n',
    'Reading list.md': '# Reading list\n'
  });
  await vault.syncToDevice();

  await evalInObsidian({
    async callback({ app, fontSizeInPixels, lib: { waitUntil }, readingListPath }) {
      const SETTLE_TIMEOUT_IN_MILLISECONDS = 20_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1000;

      app.changeTheme('obsidian');

      await waitUntil({
        message: 'the staged notes to appear in the vault',
        predicate: () => Boolean(app.vault.getFileByPath(readingListPath)),
        timeoutInMilliseconds: SETTLE_TIMEOUT_IN_MILLISECONDS
      });

      // The drawer's foot carries the vault switcher, which in a capture run
      // shows the harness's generated `temp-vault-XXXXXX` name — a private-looking
      // string that belongs in no listing.
      const style = createEl('style');
      style.textContent = '.workspace-drawer-vault-switcher, .workspace-drawer-header-switcher { visibility: hidden; }';
      document.head.append(style);

      // Small enough that an email subject and a `2026-08` folder both fit a
      // 450dp screen without wrapping.
      app.vault.setConfig('baseFontSize', fontSizeInPixels);
      const fontApp: unknown = app;
      (fontApp as FontSizeApp).updateFontSize();

      app.vault.setConfig('showInlineTitle', false);
      const inlineTitleApp: unknown = app;
      (inlineTitleApp as InlineTitleApp).updateInlineTitleDisplay();

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { fontSizeInPixels: MOBILE_FONT_SIZE_IN_PIXELS, readingListPath: 'Reading list.md' },
    vaultPath: vaultPath()
  });

  mailboxAddress = await registerMailbox();
  expect(mailboxAddress).toContain('@');
});

describe('mobile store screenshots', () => {
  it('1 - an email, in the vault, as a note', async () => {
    await sendEmail({ subject: RECEIPT_SUBJECT, text: 'Order 4471 is on its way. Tracking: PX-88213.' });
    const notePath = await fetchEmails(RECEIPT_SUBJECT);
    const content = await openNote(notePath, 'preview');
    expect(content).toContain(RECEIPT_SUBJECT);
    await shoot(1, 'Mail it to your vault and it arrives as a note');
  });

  it('2 - attachments arrive with it', async () => {
    await sendEmail({
      attachmentFileName: ATTACHMENT_FILE_NAME,
      subject: ATTACHMENT_SUBJECT,
      text: 'The invoice for March is attached.'
    });
    const notePath = await fetchEmails(ATTACHMENT_SUBJECT);
    const content = await openNote(notePath, 'preview');
    expect(content).toContain(ATTACHMENT_FILE_NAME);
    const paths = await listFiles();
    expect(paths.some((path) => path.endsWith(ATTACHMENT_FILE_NAME))).toBe(true);
    await shoot(2, 'Attachments come with it, saved into the vault');
  });

  it('3 - a folder that fills itself', async () => {
    await sendEmail({ subject: BOOKING_SUBJECT, text: 'Table for two, 14 March at 19:30.' });
    await fetchEmails(BOOKING_SUBJECT);
    const notePath = await findEmailNote(BOOKING_SUBJECT);
    await openNote(notePath, 'preview', true);
    const paths = await listFiles();
    const emailNotePaths = paths.filter((path) => path.startsWith(`${EMAILS_FOLDER}/`));
    // Named, because this is the THIRD face of one cause. This shot photographs a folder that has
    // FILLED, so it needs the notes shots 1 and 2 produced as well as its own; when mail is slow it
    // fails here on a count while they fail on their own waits, and the bare `expected 2 to be
    // greater than 2` reads as a defect in this shot rather than as the same slow mailbox.
    expect(
      emailNotePaths.length,
      'Shot 3 needs the notes shots 1 and 2 produced as well as its own. The vault holds'
        + ` ${String(emailNotePaths.length)} under \`${EMAILS_FOLDER}/\`: ${emailNotePaths.join(', ') || '(none)'}.`
        + ' A count short here is not a defect in shot 3 — it is mail from an earlier shot that never arrived.'
    ).toBeGreaterThan(2);
    await shoot(3, 'Everything you forward, filed and searchable');
  });

  it('4 - the shape and the place are yours', async () => {
    await applyCustomTemplates();
    await runCommand('redownload-all-emails');
    const notePath = await waitForNoteUnder(CUSTOM_TEMPLATE_FOLDER);
    const content = await openNote(notePath, 'preview');
    // The new template's own frontmatter, so the frame cannot be the old note
    // photographed in a new folder.
    expect(content).toContain('tags:');
    expect(content).toContain('inbox/email');
    await shoot(4, 'Templates decide the path and the note itself');
  });

  it('5 - fetch now, or leave it to the timer', async () => {
    const commandNames = await openCommandPalette('Email to Vault');
    expect(commandNames.join('\n')).toContain('Check emails');
    await shootWithSoftKeyboard(5, 'Fetch on demand, or let it check on a timer');
  });
});

/**
 * One expired Node-side wait, as {@link describeWait} reports it.
 */
interface DescribeWaitParams {
  /**
   * What the wait was allowed, so a reader can tell a budget that expired from one that was never reached.
   */
  readonly budgetInMilliseconds: number;

  /**
   * Whose fault this class of wait usually is — the one line that tells a slow third-party service apart from a defect here.
   */
  readonly cause: string;

  /**
   * What the wait actually spent.
   */
  readonly elapsedInMilliseconds: number;

  /**
   * Every file in the vault as the last poll saw it.
   */
  readonly paths: readonly string[];

  /**
   * How many times the condition was checked.
   */
  readonly polls: number;

  /**
   * What was being waited for, phrased to complete `Waited 12.3 s for …`.
   */
  readonly waitedFor: string;
}

/**
 * The registration's in-Obsidian state, seeded by `start` and read by every `poll`.
 *
 * It lives in a {@link ContextId} rather than in the closures because the
 * registration is kicked off in one eval and observed from later ones — the whole
 * point of the split. The desktop twin of this helper carries the same reasoning.
 */
interface MailboxRegistrationContext {
  hasSettled: boolean;
  registrationError: string;
  seenNotices: string[];
}

/**
 * One reading of the registration, taken inside Obsidian by a single `poll`.
 */
interface MailboxRegistrationStatus {
  readonly address: string;
  readonly hasSettled: boolean;
  readonly notices: string;
  readonly registrationError: string;
}

/**
 * Parameters for {@link sendEmail}.
 */
interface SendEmailParams {
  readonly attachmentFileName?: string;
  readonly subject: string;
  readonly text: string;
}

/**
 * Rewrites the note and path templates, then reloads the plugin so it reads them.
 *
 * Written through the settings FILE rather than the settings object: the settings
 * component hands out a copy, and a reload is what makes a written file real —
 * the same pair of facts the address read-back above depends on. The address and
 * its secret key are preserved, so the mailbox registered earlier still works.
 */
async function applyCustomTemplates(): Promise<void> {
  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, noteTemplate, pathTemplate, pluginId }) {
      const RELOAD_TIMEOUT_IN_MILLISECONDS = 20_000;
      const DATA_PATH = `.obsidian/plugins/${pluginId}/data.json`;

      const settings: unknown = JSON.parse(await app.vault.adapter.read(DATA_PATH));
      const record = settings as Record<string, unknown>;
      record['emailNotePathTemplate'] = pathTemplate;
      record['emailNoteTemplate'] = noteTemplate;
      await app.vault.adapter.write(DATA_PATH, JSON.stringify(record, null, 2));

      await app.plugins.disablePlugin(pluginId);
      await app.plugins.enablePlugin(pluginId);

      await waitUntil({
        message: 'the plugin to register its commands again',
        predicate: () => Object.hasOwn(app.commands.commands, `${pluginId}:redownload-all-emails`),
        timeoutInMilliseconds: RELOAD_TIMEOUT_IN_MILLISECONDS
      });
    },
    input: { noteTemplate: CUSTOM_TEMPLATE_NOTE_TEMPLATE, pathTemplate: CUSTOM_TEMPLATE_PATH_TEMPLATE, pluginId: PLUGIN_ID },
    vaultPath: vaultPath()
  });
}

/**
 * Builds the image sent as an attachment.
 *
 * Drawn as shapes rather than text: sharp renders SVG text through whatever fonts
 * the host happens to have, so a captioned placeholder would look different on
 * another machine — or lose its caption entirely.
 *
 * @returns The PNG's bytes.
 */
async function buildInvoiceImage(): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260">
    <rect width="420" height="260" rx="10" fill="#f4f5f8"/>
    <rect x="24" y="26" width="150" height="16" rx="8" fill="#5a76b4"/>
    <rect x="24" y="70" width="372" height="8" rx="4" fill="#d8dce5"/>
    <rect x="24" y="94" width="330" height="8" rx="4" fill="#d8dce5"/>
    <rect x="24" y="118" width="360" height="8" rx="4" fill="#d8dce5"/>
    <rect x="24" y="160" width="372" height="2" fill="#c3c9d6"/>
    <rect x="240" y="180" width="156" height="14" rx="7" fill="#8b9dc6"/>
    <rect x="300" y="212" width="96" height="20" rx="10" fill="#5a76b4"/>
  </svg>`;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Describes a Node-side wait that ran out of budget.
 *
 * Every line of it exists because the failure it replaces was a bare
 * `Test timed out in 180000ms` naming the `it` rather than the wait — so this
 * says WHAT was waited for, for HOW LONG, what the vault held while waiting,
 * and, last and most important, WHOSE FAULT that class of wait usually is.
 *
 * @param params - The wait that expired.
 * @returns The diagnostic message.
 */
function describeWait(params: DescribeWaitParams): string {
  const emailNotePaths = params.paths.filter((path) => path.startsWith(`${EMAILS_FOLDER}/`));

  return [
    `Waited ${formatDuration(params.elapsedInMilliseconds)} for ${params.waitedFor}, and it never arrived.`,
    `Budget ${formatDuration(params.budgetInMilliseconds)}, spent over ${String(params.polls)} poll(s).`,
    `Mailbox: ${mailboxAddress === '' ? '(never registered)' : mailboxAddress}.`,
    `The vault holds ${String(emailNotePaths.length)} file(s) under \`${EMAILS_FOLDER}/\`: ${emailNotePaths.join(', ') || '(none)'}.`,
    params.cause
  ].join('\n');
}

/**
 * Runs the plugin's own `Check emails` command and waits for the note to appear.
 *
 * Polled from the Node side rather than inside one closure: the fetch crosses a
 * real network, and a whole round trip does not fit the transport's per-call cap.
 *
 * Bounded by a DEADLINE rather than by an attempt count, which is not a style
 * preference. The count this replaced — 24 attempts at 5s, each also running a
 * `check-emails` whose in-Obsidian settle alone is 4s — gave the loop a budget
 * of roughly 230s against a 180s per-test budget, so the throw below could never
 * be reached: vitest always expired first and reported the `it`. A deadline read
 * from {@link DELIVERY_BUDGET_IN_MILLISECONDS} is provably under the per-test
 * budget, because that budget is derived from it.
 *
 * @param subject - The subject of the message being waited for.
 * @returns The path of the note the plugin created.
 */
async function fetchEmails(subject: string): Promise<string> {
  const POLL_INTERVAL_IN_MILLISECONDS = 5000;

  const startedAtInMilliseconds = Date.now();
  let paths: string[] = [];
  let polls = 0;

  while (Date.now() - startedAtInMilliseconds < DELIVERY_BUDGET_IN_MILLISECONDS) {
    polls++;
    await runCommand('check-emails');

    paths = await listFiles();
    const notePath = paths.find((path) => path.startsWith(`${EMAILS_FOLDER}/`) && path.includes(shortenSubject(subject)));
    if (notePath) {
      return notePath;
    }

    await sleepInNode({ milliseconds: POLL_INTERVAL_IN_MILLISECONDS });
  }

  throw new Error(describeWait({
    budgetInMilliseconds: DELIVERY_BUDGET_IN_MILLISECONDS,
    cause: 'Nothing here is staged, so this wait is INBOUND MAIL DELIVERY: a real message crossing SMTP into a disposable'
      + ' Mail.tm mailbox. Nothing in this repo controls that latency, and it was measured at 261 s on 2026-09-20 — so a'
      + ' wait that runs the whole budget is far more likely to be a slow mailbox than a broken suite. Send one message to a'
      + ' Mail.tm mailbox by hand and time it before treating this as a regression.',
    elapsedInMilliseconds: Date.now() - startedAtInMilliseconds,
    paths,
    polls,
    waitedFor: `a note under \`${EMAILS_FOLDER}/\` whose name carries "${shortenSubject(subject)}" (subject: "${subject}")`
  }));
}

/**
 * Finds the note the plugin wrote for a message.
 *
 * @param subject - The message's subject.
 * @returns The note's path.
 */
async function findEmailNote(subject: string): Promise<string> {
  const paths = await listFiles();
  const notePath = paths.find((path) => path.startsWith(`${EMAILS_FOLDER}/`) && path.includes(shortenSubject(subject)));
  if (!notePath) {
    throw new Error(`No note found for: ${subject}`);
  }

  return notePath;
}

/**
 * Renders a millisecond count as seconds, for a message a human reads.
 *
 * @param milliseconds - The duration.
 * @returns The duration in seconds, to one decimal place.
 */
function formatDuration(milliseconds: number): string {
  const MILLISECONDS_IN_SECOND = 1000;

  return `${(milliseconds / MILLISECONDS_IN_SECOND).toFixed(1)} s`;
}

/**
 * Lists every file in the vault.
 *
 * @returns Every file path in the vault.
 */
async function listFiles(): Promise<string[]> {
  return await evalInObsidian({
    callback({ app }) {
      return app.vault.getFiles().map((file) => file.path);
    },
    vaultPath: vaultPath()
  });
}

/**
 * Opens the command palette and filters it to this plugin's commands.
 *
 * @param query - What to type into the palette.
 * @returns The names of the commands this plugin registers.
 */
async function openCommandPalette(query: string): Promise<string[]> {
  return await evalInObsidian({
    async callback({ app, lib: { waitUntil }, pluginId, query: text }) {
      const PALETTE_TIMEOUT_IN_MILLISECONDS = 15_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1200;
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 2000;

      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);

      app.commands.executeCommandById('command-palette:open');

      await waitUntil({
        message: 'the command palette to open',
        predicate: () => Boolean(document.querySelector('.prompt input')),
        timeoutInMilliseconds: PALETTE_TIMEOUT_IN_MILLISECONDS
      });

      const input = document.querySelector('.prompt input');
      if (!(input instanceof HTMLInputElement)) {
        throw new TypeError('The command palette has no input.');
      }

      input.value = text;
      // The palette filters from its own input handler, so setting the value
      // alone would leave every command in the vault on screen.
      input.dispatchEvent(new Event('input'));

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      return Object.values(app.commands.commands)
        .filter((command) => command.id.startsWith(`${pluginId}:`))
        .map((command) => command.name);
    },
    input: { pluginId: PLUGIN_ID, query },
    vaultPath: vaultPath()
  });
}

/**
 * Opens a note in the given mode, with the file tree fully expanded.
 *
 * @param notePath - Vault-relative path of the note.
 * @param mode - `preview` for the rendered note, `source` for its Markdown.
 * @returns The note's Markdown.
 */
async function openNote(notePath: string, mode: string, shouldShowTree = false): Promise<string> {
  await evalInObsidian({
    async callback({ app, lib: { pressKey, waitUntil }, mode: viewMode, notePath: path }) {
      /*
       * Under the transport's ~30s per-closure cap, not at it.
       * This wait shares its budget with 3.5s of settles, which is what the ceiling was cut to
       * 12_000 for: the drawer retry used to sit in this closure too, and at 20_000 the whole
       * thing declared 50.5s, so the eval was killed at the cap and reported as a bare
       * transport timeout naming the harness rather than the wait that overran.
       * The retry is in Node now, so the shared budget is no longer the binding constraint —
       * the ceiling stays where it is because the note rendering lands in well under a second
       * and the smaller number costs nothing.
       */
      const RENDER_TIMEOUT_IN_MILLISECONDS = 12_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 2000;

      // Let the previous shot's capture settle: the device-metrics override it
      // sets and clears disturbs anything driven too soon afterwards.
      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);

      // A previous shot may have left the command palette on top of the note.
      const prompt = document.querySelector('.prompt');
      if (prompt) {
        await pressKey({ key: 'Escape' });
        await sleep(SETTLE_DELAY_IN_MILLISECONDS);
      }

      const file = app.vault.getFileByPath(path);
      if (!file) {
        throw new Error(`Note is missing from the vault: ${path}`);
      }

      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(file);
      await leaf.setViewState({
        state: { file: path, mode: viewMode, source: viewMode === 'source' },
        type: 'markdown'
      });

      await waitUntil({
        message: 'the note to render',
        predicate: () => Boolean(document.querySelector('.cm-content, .markdown-preview-view')),
        timeoutInMilliseconds: RENDER_TIMEOUT_IN_MILLISECONDS
      });

      // A folder the tree has not expanded is a folder the reader cannot see, and
      // the email folder is created by the plugin mid-run, so it arrives collapsed.
      const fileExplorerLeaf = app.workspace.getLeavesOfType('file-explorer')[0];
      if (!fileExplorerLeaf) {
        return;
      }

      const view: unknown = fileExplorerLeaf.view;
      for (const item of Object.values((view as FileExplorerView).fileItems)) {
        if (item.collapsed === true) {
          await item.setCollapsed?.(false);
        }
      }
    },
    input: { mode, notePath },
    vaultPath: vaultPath()
  });

  /*
   * The tree lives in the left DRAWER on a phone, and it covers most of the screen — so it is
   * opened only where the claim is about WHERE notes land, and left shut for the shots that are
   * about a note's own content.
   *
   * Three tricks, each of which looks like the others from outside: the split's `collapsed`
   * flag reads false while the element is still `display: none` (so collapse first, then
   * expand); `revealLeaf` must come AFTER the drawer is out or the rows lay out at zero width;
   * and the drawer slides, so a frame taken too early is a black panel.
   *
   * The retry runs from NODE, one attempt per transport call. Every sleep in an attempt is
   * unconditional, so an attempt really costs the toggle plus both settles — 5 500 ms — and six
   * of them is 33 000 ms, past the ~30 000 ms a single transport call is capped at. Run inside
   * one closure, as this was, the sixth attempt crossed the cap and the `Error` below could
   * never be thrown: an exhausted retry died instead as a bare `WebDriverError: script timeout`
   * naming only `AppiumTransport.evaluate` — the one failure the retry anticipated was the one
   * failure it could not report.
   */
  if (shouldShowTree) {
    const DRAWER_ATTEMPTS = 6;
    const DRAWER_SETTLE_DELAY_IN_MILLISECONDS = 2500;
    const TOGGLE_DELAY_IN_MILLISECONDS = 500;
    const POLL_INTERVAL_IN_MILLISECONDS = 500;
    const DRAWER_ATTEMPT_COST_IN_MILLISECONDS = TOGGLE_DELAY_IN_MILLISECONDS + 2 * DRAWER_SETTLE_DELAY_IN_MILLISECONDS;

    /*
     * A Node-side budget, where the cap does not apply, rather than an attempt count: the
     * deadline is checked after an unsatisfied attempt RETURNS, so 33 000 ms admits exactly six
     * of them — the fifth ends at 29 500 ms and the sixth at 35 500 ms.
     */
    const DRAWER_BUDGET_IN_MILLISECONDS = DRAWER_ATTEMPTS * DRAWER_ATTEMPT_COST_IN_MILLISECONDS;

    let lastAttempt: DrawerAttempt | undefined;

    try {
      await pollInObsidian({
        /*
         * The delays travel as `input` rather than as literals inside the closure so the
         * attempt cost above and the sleeps below are the same three numbers — and the
         * `no-over-cap-wait-in-eval-in-obsidian` lint rule follows a destructured parameter
         * back through `input`, so the closure is still sized at 5 500 ms rather than read as
         * unbounded.
         */
        input: {
          drawerSettleDelayInMilliseconds: DRAWER_SETTLE_DELAY_IN_MILLISECONDS,
          toggleDelayInMilliseconds: TOGGLE_DELAY_IN_MILLISECONDS
        },
        intervalInMilliseconds: POLL_INTERVAL_IN_MILLISECONDS,
        async poll({ app, drawerSettleDelayInMilliseconds, toggleDelayInMilliseconds }): Promise<DrawerAttempt> {
          function isDrawerOpen(): boolean {
            return [...document.querySelectorAll('.nav-files-container .tree-item-self')]
              .map((row) => row.getBoundingClientRect())
              .some((rect) => rect.width > 0 && rect.left >= 0);
          }

          // ONE collapse/expand pair per attempt, never two: calling `expand()`
          // again on a drawer that is already sliding open toggles it back, so an
          // eager retry flips it open and shut forever and never satisfies its own
          // predicate. The poll interval is what keeps the next attempt from
          // landing mid-slide.
          app.workspace.leftSplit.collapse();
          await sleep(toggleDelayInMilliseconds);
          app.workspace.leftSplit.expand();
          await sleep(drawerSettleDelayInMilliseconds);

          const fileExplorerLeaf = app.workspace.getLeavesOfType('file-explorer')[0];
          if (fileExplorerLeaf) {
            await app.workspace.revealLeaf(fileExplorerLeaf);
          }

          await sleep(drawerSettleDelayInMilliseconds);

          // The two facts that told the story when this failed: the split's own
          // flag, and whether the drawer element is actually displayed. They
          // disagree, and that disagreement IS the bug this retry works around.
          const drawer = document.querySelector('.workspace-drawer.mod-left');

          return {
            collapsed: app.workspace.leftSplit.collapsed,
            display: drawer ? window.getComputedStyle(drawer).display : 'no-drawer',
            isOpen: isDrawerOpen()
          };
        },
        timeoutInMilliseconds: DRAWER_BUDGET_IN_MILLISECONDS,
        timeoutMessage: 'the file drawer to finish opening',
        until(attempt: DrawerAttempt): boolean {
          // Remembered in NODE, because the attempt that fails is no longer the one
          // that reports: the diagnostic below is thrown out here rather than
          // inside Obsidian.
          lastAttempt = attempt;
          return attempt.isOpen;
        },
        vaultPath: vaultPath()
      });
    } catch (error) {
      // Only a drawer that was actually polled and never opened gets the drawer's
      // own message; anything that failed before the first attempt returned — a
      // missing note, a dead transport — is reported as itself.
      if (!lastAttempt) {
        throw error;
      }

      throw new Error(
        `The file drawer never finished opening. collapsed=${String(lastAttempt.collapsed)} display=${lastAttempt.display}`,
        { cause: error }
      );
    }
  } else {
    await evalInObsidian({
      callback({ app }) {
        app.workspace.leftSplit.collapse();
      },
      vaultPath: vaultPath()
    });
  }

  return await evalInObsidian({
    async callback({ app, notePath: path }) {
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;

      const file = app.vault.getFileByPath(path);
      if (!file) {
        throw new Error(`Note is missing from the vault: ${path}`);
      }

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      return await app.vault.read(file);
    },
    input: { notePath },
    vaultPath: vaultPath()
  });
}

/**
 * Reads the SMTP settings the plugin's own live integration suite uses.
 *
 * @returns The `.env` values, keyed by name.
 */
function readEnvironment(): Record<string, string> {
  const lines = readFileSync(join(process.cwd(), '.env'), 'utf-8').split('\n');
  const entries = lines
    .filter((line) => line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replaceAll(/^["']|["']$/g, '')] as const;
    });

  return Object.fromEntries(entries);
}

/**
 * Has the PLUGIN create its own disposable mailbox.
 *
 * This is the method the settings tab's own button calls, reached by walking the
 * plugin's component graph — the settings tab itself cannot be opened from a
 * capture run. Creating the account with the Mail.tm API directly would have been
 * easier and would have proved nothing about the plugin.
 *
 * @returns The address the plugin registered.
 */
async function registerMailbox(): Promise<string> {
  /*
   * A NODE-side budget, where the transport's ~30s per-eval cap does not apply -
   * not one long wait inside a single closure. The desktop twin of this helper
   * carries the same reasoning.
   *
   * The shape this replaced awaited `registerRandomEmailAddress` - a live round
   * trip to a third-party mailbox service - and THEN waited 25 000 ms for the
   * address to reach the settings file, both inside one `evalInObsidian`. The
   * registration declared no budget, so `no-over-cap-wait-in-eval-in-obsidian`
   * sized that closure at 25 000 ms and called it comfortably under the cap; the
   * network time it could not see was spent in the same eval, so a slow
   * registration pushed real elapsed past the cap. The eval then died as a bare
   * transport timeout naming only the harness, throwing away the one diagnostic
   * that says WHY no address arrived.
   *
   * Split across `start` and `poll`, no single transport call is long: `start`
   * kicks the registration off and returns, each `poll` is a settings-file read,
   * and the budget below is spent in Node between them. It is generous on purpose
   * - this is the one thing in these suites that can genuinely take tens of
   * seconds - and costs nothing when the mailbox service answers quickly, because
   * `until` accepts the first poll that carries an address.
   */
  const REGISTER_BUDGET_IN_MILLISECONDS = 90_000;
  const REGISTER_POLL_INTERVAL_IN_MILLISECONDS = 500;

  /**
   * Describes a registration that produced no address.
   *
   * @param status - The last status read out of Obsidian.
   * @returns The diagnostic message.
   */
  function describeFailure(status: MailboxRegistrationStatus): string {
    return `Registration produced no address. address=${status.address} hasSettled=${String(status.hasSettled)}`
      + ` registrationError=${status.registrationError} notices=${status.notices}`;
  }

  const contextId = new ContextId<MailboxRegistrationContext>();
  let lastStatus: MailboxRegistrationStatus | undefined;
  let status: MailboxRegistrationStatus;

  try {
    status = await pollInObsidian({
      contextId,
      input: { pluginId: PLUGIN_ID },
      intervalInMilliseconds: REGISTER_POLL_INTERVAL_IN_MILLISECONDS,
      async poll({ app, context, pluginId }): Promise<MailboxRegistrationStatus> {
        const DATA_PATH = `.obsidian/plugins/${pluginId}/data.json`;

        // Read back from the SETTINGS FILE, not from the object graph: the settings
        // component hands out a copy, so an object found by walking the plugin keeps
        // reporting the empty address it held before registration.
        let address: string;
        try {
          const raw: unknown = JSON.parse(await app.vault.adapter.read(DATA_PATH));
          const value: unknown = (raw as Record<string, unknown>)['emailAddress'];
          address = typeof value === 'string' ? value : '';
        } catch {
          address = '';
        }

        // Notices are ACCUMULATED across polls rather than read once at the end. An
        // Obsidian notice clears itself after a few seconds, so the one naming why
        // registration failed is usually gone by the time a budget expires - which
        // the single-eval shape could do nothing about, having only ever one look.
        const currentNotices = [...document.querySelectorAll('.notice')].map((notice) => notice.textContent);
        for (const text of currentNotices) {
          if (text !== '' && !context.seenNotices.includes(text)) {
            context.seenNotices.push(text);
          }
        }

        return {
          address,
          hasSettled: context.hasSettled,
          notices: context.seenNotices.join(' ~ '),
          registrationError: context.registrationError
        };
      },
      start({ app, context, pluginId }): void {
        interface MailboxRegistrar {
          registerRandomEmailAddress: (this: void) => Promise<void>;
        }

        function findByMember(memberName: string): null | object {
          const blocked = new Set(['app', 'containerEl', 'dom', 'metadataCache', 'plugins', 'vault', 'workspace']);
          const seen = new Set<unknown>();
          const queue: unknown[] = [app.plugins.getPlugin(pluginId)];
          let budget = 12_000;

          while (queue.length > 0 && budget-- > 0) {
            const current = queue.shift();
            if (current === null || typeof current !== 'object' || seen.has(current)) {
              continue;
            }

            seen.add(current);
            const record = current as Record<string, unknown>;
            // A plain read rather than an `in` check: the member being looked for is
            // A method, which lives on the prototype.
            const member: unknown = record[memberName];
            if (member !== undefined) {
              return current;
            }

            for (const [key, value] of Object.entries(record)) {
              if (!blocked.has(key)) {
                queue.push(value);
              }
            }
          }

          return null;
        }

        const registrar = findByMember('registerRandomEmailAddress') as MailboxRegistrar | null;
        if (!registrar) {
          throw new Error('The plugin exposes no mailbox registrar.');
        }

        context.hasSettled = false;
        context.registrationError = '';
        context.seenNotices = [];

        // Kicked off and deliberately NOT awaited: awaiting the live round trip
        // here is precisely what this helper moved to Node to stop doing. The
        // outcome is recorded in the shared context instead, which every `poll`
        // reads - so a registration that REJECTS is reported rather than lost.
        registrar.registerRandomEmailAddress()
          .then(() => {
            context.hasSettled = true;
          })
          .catch((error: unknown) => {
            context.hasSettled = true;
            context.registrationError = error instanceof Error ? error.message : String(error);
          });
      },
      timeoutInMilliseconds: REGISTER_BUDGET_IN_MILLISECONDS,
      timeoutMessage: 'the plugin to record the address it registered',
      until(pollStatus: MailboxRegistrationStatus): boolean {
        // Remembered in NODE, because the poll that fails is not the one that
        // reports: the diagnostic is thrown from the `catch` below.
        lastStatus = pollStatus;

        // A registration that has already rejected will never produce an address,
        // so stop on that too rather than spending the rest of the budget polling
        // a service that has answered.
        return pollStatus.address.includes('@') || pollStatus.registrationError !== '';
      },
      vaultPath: vaultPath()
    });
  } catch (error) {
    // Only a registration that was actually polled gets the diagnostic; anything
    // that failed before the first poll returned - no registrar, a dead transport
    // - is reported as itself.
    if (!lastStatus) {
      throw error;
    }

    throw new Error(describeFailure(lastStatus), { cause: error });
  } finally {
    await contextId.dispose(vaultPath());
  }

  if (!status.address.includes('@')) {
    throw new Error(describeFailure(status));
  }

  return status.address;
}

/**
 * Runs one of the plugin's own commands.
 *
 * @param commandId - The command's id, without the plugin prefix.
 */
async function runCommand(commandId: string): Promise<void> {
  await evalInObsidian({
    async callback({ app, commandId: id, pluginId }) {
      const SETTLE_DELAY_IN_MILLISECONDS = 4000;

      const fullId = `${pluginId}:${id}`;
      if (!Object.hasOwn(app.commands.commands, fullId)) {
        throw new Error(`No such command: ${fullId}`);
      }

      app.commands.executeCommandById(fullId);
      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { commandId, pluginId: PLUGIN_ID },
    vaultPath: vaultPath()
  });
}

/**
 * Sends a real email to the mailbox the plugin registered.
 *
 * @param params - The message to send.
 */
async function sendEmail(params: SendEmailParams): Promise<void> {
  const environment = readEnvironment();
  const transport = createTransport({
    auth: { pass: environment['SMTP_PASS'] ?? '', user: environment['SMTP_USER'] ?? '' },
    host: environment['SMTP_HOST'] ?? '',
    port: Number(environment['SMTP_PORT'] ?? ''),
    secure: environment['SMTP_SECURE'] === 'true'
  });

  const attachments = params.attachmentFileName
    ? [{ content: Buffer.from(await buildInvoiceImage()), filename: params.attachmentFileName }]
    : [];

  await transport.sendMail({
    attachments,
    from: environment['SMTP_USER'] ?? '',
    subject: params.subject,
    text: params.text,
    to: mailboxAddress
  });
}

/**
 * Captures the window, captions it, and writes it as
 * `images/screenshots/screenshot-mobile-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const captured = await captureObsidianScreenshot({ vaultPath: vaultPath() });

  await writeFrame(index, caption, captured);
}

/**
 * Raises the soft keyboard, captures the DEVICE, and writes the frame.
 *
 * For a shot whose subject is a focused field. `captureObsidianScreenshot` cannot show a keyboard: it
 * drives Appium in the WebView context, so it photographs the page, and the IME is a system window that
 * is not part of the page — which left such a frame as a field over a large empty band, with the caption
 * band landing on the field and clipping the typed text.
 *
 * Two things are needed and both belong to the harness rather than here: the AVD is built with a hardware
 * keyboard attached, so Android suppresses the on-screen one until `withSoftKeyboardEnabled` lifts that
 * and puts the setting back exactly — including putting back a setting that had never been written, which
 * takes a delete rather than a write; and a WebView will not ask for an IME on programmatic focus alone,
 * so `raiseSoftKeyboard` lands a real touch on the field and then proves geometrically that it lifted,
 * because nothing in the page reports the keyboard.
 *
 * The trade, which applies only to the shots that switch: a device capture is **not** byte-reproducible,
 * because the status-bar clock and the battery indicator are in it. A shot with no focused field keeps
 * {@link shoot} and stays reproducible — a real phone shows no keyboard there either, so raising one
 * would make that frame less true rather than more.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shootWithSoftKeyboard(index: number, caption: string): Promise<void> {
  /*
   * The field keeps focus, and its caret blinks, so which phase the shutter caught decided the pixels
   * next to the typed text. Not a blur, as the desktop suite does: the focused field with the keyboard
   * up is this frame's subject. A transparent caret leaves the focus, and the keyboard, where they are.
   */
  await evalInObsidian({
    callback({ selector }) {
      const input = activeDocument.querySelector(selector);
      if (input instanceof HTMLElement) {
        input.setCssStyles({ caretColor: 'transparent' });
      }
    },
    input: { selector: PALETTE_INPUT_SELECTOR },
    vaultPath: vaultPath()
  });

  const captured = await withSoftKeyboardEnabled({
    async callback() {
      await raiseSoftKeyboard({
        deviceId,
        inputSelector: PALETTE_INPUT_SELECTOR,
        vaultPath: vaultPath()
      });

      return await captureDeviceScreenshot({ deviceId });
    },
    deviceId
  });

  await writeFrame(index, caption, captured);
}

/**
 * Reduces a subject to something that survives the note-path template.
 *
 * The template puts the subject in the file name, where Obsidian's forbidden
 * characters are replaced — so the full subject is not a safe thing to match on.
 *
 * @param subject - The message's subject.
 * @returns The part of it that reaches the file name unchanged.
 */
function shortenSubject(subject: string): string {
  return subject.split(/[:,]/, 1)[0] ?? subject;
}

function vaultPath(): string {
  return getTemporaryVault().path;
}

/**
 * Waits for the plugin to write a note under a folder.
 *
 * Carries its OWN budget rather than the delivery one, because it waits on a
 * different thing: the mail is already in the vault and `redownload-all-emails`
 * only writes it out again under the new templates. Giving it the delivery
 * budget would sit on a real defect in this repo for 450 s and then describe it
 * as a slow mailbox.
 *
 * @param folder - The folder the note should appear under.
 * @returns The note's path.
 */
async function waitForNoteUnder(folder: string): Promise<string> {
  const POLL_INTERVAL_IN_MILLISECONDS = 3000;

  const startedAtInMilliseconds = Date.now();
  let paths: string[] = [];
  let polls = 0;

  while (Date.now() - startedAtInMilliseconds < REDOWNLOAD_BUDGET_IN_MILLISECONDS) {
    polls++;
    paths = await listFiles();
    const notePath = paths.find((path) => path.startsWith(`${folder}/`) && path.endsWith('.md'));
    if (notePath) {
      return notePath;
    }

    await sleepInNode({ milliseconds: POLL_INTERVAL_IN_MILLISECONDS });
  }

  throw new Error(describeWait({
    budgetInMilliseconds: REDOWNLOAD_BUDGET_IN_MILLISECONDS,
    cause: 'Nothing crosses the network here: the mail is already in the vault, and `redownload-all-emails` only writes it'
      + ' out again under the templates `applyCustomTemplates` just wrote. So unlike the delivery wait, this one expiring IS'
      + ' a defect in this repo — most likely the settings write or the plugin reload, not the mailbox.',
    elapsedInMilliseconds: Date.now() - startedAtInMilliseconds,
    paths,
    polls,
    waitedFor: `any \`.md\` note under \`${folder}/\`, the folder the custom path template writes to`
  }));
}

/**
 * Asserts the frame is the store size, captions it, and writes it out.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 * @param captured - The raw PNG, from either capture route.
 */
async function writeFrame(index: number, caption: string, captured: Uint8Array): Promise<void> {
  // The AVD is 900x1600, so the device frame IS the store's size. Asserting it
  // here is what keeps that true: run this against any other AVD and it fails
  // loudly instead of quietly shipping an off-spec image.
  expect(readPngDimensions(captured)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  const labeled = await labelScreenshot(captured, { text: caption });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-mobile-${String(index)}.png`), labeled);
}
