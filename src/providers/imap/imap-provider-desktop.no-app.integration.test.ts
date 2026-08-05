import type { MessageStructureObject } from 'imapflow';

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createTransport } from 'nodemailer';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

const POLL_INTERVAL_IN_MILLISECONDS = 3000;
const MAX_WAIT_IN_MILLISECONDS = 60_000;
const TEST_SUBJECT_PREFIX = `imap-integration-test-${String(Date.now())}`;

interface SendTestEmailOptions {
  readonly attachments?: TestAttachment[];
  readonly cc?: string;
  readonly html?: string;
  readonly text?: string;
}

interface TestAttachment {
  content: Buffer | string;
  contentType: string;
  filename: string;
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

function createSmtpTransport(): ReturnType<typeof createTransport> {
  return createTransport({
    auth: {
      pass: getRequiredEnv('SMTP_PASS'),
      user: getRequiredEnv('SMTP_USER')
    },
    host: getRequiredEnv('SMTP_HOST'),
    port: Number(getRequiredEnv('SMTP_PORT')),
    secure: getRequiredEnv('SMTP_SECURE') === 'true'
  });
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required. Add it to your .env file.`);
  }
  return value;
}

async function pollForMessage(subject: string): Promise<number> {
  const startTime = Date.now();
  const client = createImapClient();
  await client.connect();

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      while (Date.now() - startTime < MAX_WAIT_IN_MILLISECONDS) {
        const foundUidList = await client.search({ subject }, { uid: true });
        if (foundUidList && foundUidList.length > 0) {
          return foundUidList[0] ?? 0;
        }

        await sleep(POLL_INTERVAL_IN_MILLISECONDS);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  throw new Error(`Message with subject "${subject}" not received within ${String(MAX_WAIT_IN_MILLISECONDS / 1000)} seconds`);
}

async function sendTestEmail(subjectSuffix: string, options?: SendTestEmailOptions): Promise<string> {
  const transport = createSmtpTransport();
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

    normalEmailUid = await pollForMessage(normalEmailSubject);
    attachmentEmailUid = await pollForMessage(attachmentEmailSubject);
  });

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
            const chunks: Uint8Array[] = [];
            for await (const chunk of downloadResult.content) {
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
      unseenEmailUid = await pollForMessage(unseenEmailSubject);
    });

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
          { bodyStructure: true, envelope: true, flags: true, source: true },
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
