import type { MessageStructureObject } from 'imapflow';

import { sleep } from '@mnaoumov/typescript-lib/async';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { lookup } from 'node:dns/promises';
import { createTransport } from 'nodemailer';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

const POLL_INTERVAL_IN_MILLISECONDS = 3000;

/**
 * How long one wait allows for a message to cross SMTP into the IMAP mailbox.
 *
 * Measured on 2026-10-29 for the `.env` account (Gmail to itself): ten sends were each searchable
 * 1.2-5.7 s after `sendMail` returned. 60 s is a 10x margin over the worst of those. This is NOT the
 * Mail.tm delivery budget the capture suites share; that is another route, measured at 261 s.
 */
const DELIVERY_BUDGET_IN_MILLISECONDS = 60_000;

const SMTP_CONNECTION_TIMEOUT_IN_MILLISECONDS = 15_000;
const SMTP_GREETING_TIMEOUT_IN_MILLISECONDS = 10_000;
const SMTP_SOCKET_TIMEOUT_IN_MILLISECONDS = 30_000;

/**
 * The most one {@link sendTestEmail} can take before nodemailer gives up on its own.
 */
const SMTP_SEND_BUDGET_IN_MILLISECONDS = SMTP_CONNECTION_TIMEOUT_IN_MILLISECONDS
  + SMTP_GREETING_TIMEOUT_IN_MILLISECONDS
  + SMTP_SOCKET_TIMEOUT_IN_MILLISECONDS;

/**
 * Everything in a sending hook that is neither a send nor the delivery wait: the IMAP connect, login
 * and logout of each poll, and one poll interval of overshoot.
 */
const HOOK_OVERHEAD_IN_MILLISECONDS = 30_000;

const MILLISECONDS_PER_SECOND = 1000;
const TEST_SUBJECT_PREFIX = `imap-integration-test-${String(Date.now())}`;

interface SendTestEmailOptions {
  readonly attachments?: TestAttachment[];
  readonly cc?: string;
  readonly html?: string;
  readonly text?: string;
}

interface TestAttachment {
  readonly content: Buffer | string;
  readonly contentType: string;
  readonly filename: string;
}

function createImapClient(): ImapFlow {
  return new ImapFlow({
    auth: {
      pass: getRequiredEnv('IMAP_PASS'),
      user: getRequiredEnv('IMAP_USER')
    },
    host: getRequiredEnv('IMAP_HOST'),
    logger: false,
    port: Number(getRequiredEnv('IMAP_PORT')),
    secure: getRequiredEnv('IMAP_SECURE') === 'true'
  });
}

/**
 * Builds the SMTP transport the suite sends its test mail through.
 *
 * The host is resolved here, with `dns.lookup`, rather than being handed to nodemailer as a name.
 * Nodemailer resolves names through `dns.Resolver` (c-ares), and only falls back to `dns.lookup`
 * once `resolve4` AND `resolve6` have both exhausted their retries — so on a machine whose
 * configured nameservers are unreachable (a VPN's, say) every send stalls for minutes before a
 * socket is ever opened, which is why none of the timeouts below can rescue it. Passing an address
 * short-circuits all of that: nodemailer returns immediately for a `net.isIP` host. `tls.servername`
 * keeps SNI and the STARTTLS certificate check pointed at the real hostname rather than the address.
 */
async function createSmtpTransport(): Promise<ReturnType<typeof createTransport>> {
  const host = getRequiredEnv('SMTP_HOST');
  const { address } = await lookup(host);

  return createTransport({
    auth: {
      pass: getRequiredEnv('SMTP_PASS'),
      user: getRequiredEnv('SMTP_USER')
    },
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_IN_MILLISECONDS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_IN_MILLISECONDS,
    host: address,
    port: Number(getRequiredEnv('SMTP_PORT')),
    secure: getRequiredEnv('SMTP_SECURE') === 'true',
    socketTimeout: SMTP_SOCKET_TIMEOUT_IN_MILLISECONDS,
    tls: { servername: host }
  });
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required. Add it to your .env file.`);
  }
  return value;
}

/**
 * The budget for a `beforeAll` that sends `sendCount` messages and then waits for them, **derived,
 * never written down**: the hook's own timeout has to sit above the waits inside it, or the wait's
 * diagnostic can never be printed and a slow delivery surfaces as a bare hook timeout instead.
 */
function getSendingHookTimeoutInMilliseconds(sendCount: number): number {
  return sendCount * SMTP_SEND_BUDGET_IN_MILLISECONDS + DELIVERY_BUDGET_IN_MILLISECONDS + HOOK_OVERHEAD_IN_MILLISECONDS;
}

/**
 * Waits for every one of `subjects` to arrive, under ONE shared {@link DELIVERY_BUDGET_IN_MILLISECONDS}, and
 * returns their UIDs in the same order.
 *
 * Each poll opens its own connection. A connection that keeps INBOX selected across polls never sees
 * a message delivered after it selected: measured against Gmail on 2026-10-29, such a connection
 * searched 18 times over 30 s without finding a message a fresh connection then found at once. So
 * a wait on a held connection only ever succeeded when the mail beat the first search.
 */
async function pollForMessages(subjects: readonly string[]): Promise<number[]> {
  const startTime = Date.now();
  const uidBySubject = new Map<string, number>();
  let polls = 0;

  while (Date.now() - startTime < DELIVERY_BUDGET_IN_MILLISECONDS) {
    polls++;
    const client = createImapClient();
    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        for (const subject of subjects) {
          if (uidBySubject.has(subject)) {
            continue;
          }
          const foundUidList = await client.search({ subject }, { uid: true });
          const uid = foundUidList ? foundUidList[0] : undefined;
          if (uid !== undefined) {
            uidBySubject.set(subject, uid);
          }
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }

    if (uidBySubject.size === subjects.length) {
      return subjects.map((subject) => uidBySubject.get(subject) ?? 0);
    }

    await sleep({ milliseconds: POLL_INTERVAL_IN_MILLISECONDS });
  }

  const missingSubjects = subjects.filter((subject) => !uidBySubject.has(subject)).map((subject) => `"${subject}"`).join(', ');
  throw new Error(
    `IMAP never delivered ${missingSubjects} within the ${String(DELIVERY_BUDGET_IN_MILLISECONDS / MILLISECONDS_PER_SECOND)} s delivery budget`
      + ` (waited ${String(Math.round((Date.now() - startTime) / MILLISECONDS_PER_SECOND))} s over ${String(polls)} polls of INBOX for ${getRequiredEnv('IMAP_USER')}).`
      + ' This wait is INBOUND MAIL DELIVERY from the SMTP account to the IMAP mailbox, measured at a few seconds;'
      + ' send one message by hand and time it before treating this as a regression.'
  );
}

async function sendTestEmail(subjectSuffix: string, options?: SendTestEmailOptions): Promise<string> {
  const transport = await createSmtpTransport();
  const subject = `${TEST_SUBJECT_PREFIX} ${subjectSuffix}`;
  const imapUser = getRequiredEnv('IMAP_USER');

  await transport.sendMail({
    attachments: options?.attachments,
    cc: options?.cc,
    from: getRequiredEnv('SMTP_USER'),
    html: options?.html,
    subject,
    text: options?.text ?? 'Test email body.',
    to: imapUser
  });

  return subject;
}

let normalEmailUid: number;
let normalEmailSubject: string;
let attachmentEmailUid: number;
let attachmentEmailSubject: string;

describe('IMAP provider integration', () => {
  beforeAll(async () => {
    normalEmailSubject = await sendTestEmail('normal');

    attachmentEmailSubject = await sendTestEmail('with-attachment', {
      attachments: [
        {
          content: 'Hello from attachment',
          contentType: 'text/plain',
          filename: 'test-file.txt'
        },
        {
          content: Buffer.from([0x89, 0x50, 0x4E, 0x47]),
          contentType: 'image/png',
          filename: 'test-image.png'
        }
      ],
      cc: getRequiredEnv('IMAP_USER'),
      html: '<p>Email with attachments</p>',
      text: 'Email with attachments'
    });

    [normalEmailUid = 0, attachmentEmailUid = 0] = await pollForMessages([normalEmailSubject, attachmentEmailSubject]);
  }, getSendingHookTimeoutInMilliseconds(2));

  afterAll(async () => {
    const client = createImapClient();
    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const foundUidList = await client.search({ subject: TEST_SUBJECT_PREFIX }, { uid: true });
        if (foundUidList && foundUidList.length > 0) {
          await client.messageDelete(foundUidList, { uid: true });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  });

  describe('connection', () => {
    it('should connect and authenticate', async () => {
      const client = createImapClient();
      await client.connect();

      expect(client.authenticated).toBeTruthy();

      await client.logout();
    });
  });

  describe('fetch messages', () => {
    it('should list messages in INBOX', async () => {
      const client = createImapClient();
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const messages = [];
        for await (const message of client.fetch('1:*', { envelope: true, flags: true, uid: true })) {
          messages.push(message);
        }

        expect(messages.length).toBeGreaterThanOrEqual(1);
        const testMessage = messages.find((m) => m.envelope?.subject === normalEmailSubject);
        expect(testMessage).toBeDefined();
      } finally {
        lock.release();
        await client.logout();
      }
    });

    it('should fetch envelope with correct fields', async () => {
      const client = createImapClient();
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const message = await client.fetchOne(String(normalEmailUid), { envelope: true, flags: true }, { uid: true });

        expect(message).toBeTruthy();
        if (message) {
          expect(message.envelope?.subject).toBe(normalEmailSubject);
          expect(message.envelope?.from?.[0]?.address).toBe(getRequiredEnv('SMTP_USER'));
          expect(message.envelope?.to?.[0]?.address).toBe(getRequiredEnv('IMAP_USER'));
          expect(message.envelope?.date).toBeInstanceOf(Date);
          expect(message.uid).toBe(normalEmailUid);
        }
      } finally {
        lock.release();
        await client.logout();
      }
    });

    it('should return an internal date for a message whose Date header cannot be read', async () => {
      const client = createImapClient();
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        // The fallback ImapProviderDesktopComponent applies when `envelope.date` parses nowhere is only
        // worth anything if the server actually hands INTERNALDATE back for the fetch shape the plugin
        // asks with - a date the server owns, so it is there whatever the sender wrote in the header.
        const message = await client.fetchOne(
          String(normalEmailUid),
          { envelope: true, internalDate: true },
          { uid: true }
        );

        expect(message).toBeTruthy();
        if (message) {
          expect(message.internalDate).toBeInstanceOf(Date);
        }
      } finally {
        lock.release();
        await client.logout();
      }
    });
  });

  describe('full message with source', () => {
    it('should fetch and parse full message source', async () => {
      const client = createImapClient();
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const message = await client.fetchOne(String(normalEmailUid), { source: true }, { uid: true });

        expect(message).toBeTruthy();
        if (message) {
          expect(message.source).toBeDefined();
          const parsed = await simpleParser(message.source ?? Buffer.alloc(0));
          expect(parsed.text?.trim()).toBe('Test email body.');
        }
      } finally {
        lock.release();
        await client.logout();
      }
    });
  });

  describe('attachments', () => {
    it('should detect attachments in bodyStructure', async () => {
      const client = createImapClient();
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const message = await client.fetchOne(String(attachmentEmailUid), { bodyStructure: true }, { uid: true });

        expect(message).toBeTruthy();
        if (message && message.bodyStructure) {
          const hasAttachment = JSON.stringify(message.bodyStructure).includes('attachment');
          expect(hasAttachment).toBe(true);
        }
      } finally {
        lock.release();
        await client.logout();
      }
    });

    it('should download attachment content', async () => {
      const client = createImapClient();
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const message = await client.fetchOne(String(attachmentEmailUid), { bodyStructure: true }, { uid: true });
        expect(message).toBeTruthy();

        if (message && message.bodyStructure) {
          const attachmentPart = findAttachmentPart(message.bodyStructure);
          expect(attachmentPart).toBeDefined();

          if (attachmentPart) {
            const downloadResult = await client.download(String(attachmentEmailUid), attachmentPart, { uid: true });
            expect(downloadResult.content).toBeDefined();
            const chunks: Uint8Array[] = [];
            for await (const chunk of downloadResult.content ?? []) {
              chunks.push(new Uint8Array(chunk as ArrayBuffer));
            }
            const content = Buffer.concat(chunks);
            expect(content.length).toBeGreaterThan(0);
          }
        }
      } finally {
        lock.release();
        await client.logout();
      }
    });
  });

  describe('cc recipients', () => {
    it('should have cc in envelope', async () => {
      const client = createImapClient();
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const message = await client.fetchOne(String(attachmentEmailUid), { envelope: true }, { uid: true });

        expect(message).toBeTruthy();
        if (message) {
          expect(message.envelope?.cc).toBeDefined();
          expect(message.envelope?.cc?.length).toBeGreaterThanOrEqual(1);
          expect(message.envelope?.cc?.[0]?.address).toBe(getRequiredEnv('IMAP_USER'));
        }
      } finally {
        lock.release();
        await client.logout();
      }
    });
  });

  describe('flags', () => {
    it('should mark message as seen and verify flag', async () => {
      const client = createImapClient();
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        await client.messageFlagsAdd(String(normalEmailUid), [String.raw`\Seen`], { uid: true });

        const message = await client.fetchOne(String(normalEmailUid), { flags: true }, { uid: true });
        expect(message).toBeTruthy();
        if (message) {
          expect(message.flags?.has(String.raw`\Seen`)).toBe(true);
        }
      } finally {
        lock.release();
        await client.logout();
      }
    });
  });

  describe('reading without marking seen', () => {
    let unseenEmailUid: number;

    beforeAll(async () => {
      const unseenEmailSubject = await sendTestEmail('unseen-preservation');
      [unseenEmailUid = 0] = await pollForMessages([unseenEmailSubject]);
    }, getSendingHookTimeoutInMilliseconds(1));

    it(String.raw`should leave the \Seen flag unset after fetching a message the way the plugin does`, async () => {
      const client = createImapClient();
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        // These fetch options mirror ImapProviderDesktopComponent.getMessage.
        // Fetching the full source must not implicitly set \Seen (imapflow uses BODY.PEEK); otherwise the
        // "Mark emails as seen" opt-out would be defeated merely by reading the message to create a note.
        const message = await client.fetchOne(
          String(unseenEmailUid),
          { bodyStructure: true, envelope: true, flags: true, internalDate: true, source: true },
          { uid: true }
        );
        expect(message).toBeTruthy();

        const afterFetch = await client.fetchOne(String(unseenEmailUid), { flags: true }, { uid: true });
        expect(afterFetch).toBeTruthy();
        if (afterFetch) {
          expect(afterFetch.flags?.has(String.raw`\Seen`)).toBe(false);
        }
      } finally {
        lock.release();
        await client.logout();
      }
    });
  });
});

function findAttachmentPart(node: MessageStructureObject): string | undefined {
  if (node.disposition === 'attachment' && node.part) {
    return node.part;
  }
  if (node.childNodes) {
    for (const child of node.childNodes) {
      const result = findAttachmentPart(child);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
}
