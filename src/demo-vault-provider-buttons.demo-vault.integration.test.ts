import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

// The button suite proves each `code-button` in `01 Create a mailbox` and `02 IMAP mode` runs without an
// error; it cannot tell a button that does nothing from one that does what its note promises. This
// file calls the same `demoSetup.ts` helpers those buttons call, through the same `CodeScript Toolkit`
// `require`, and asserts the settings each one is documented to apply.

interface ProviderButtonsResult {
  readonly afterDeleteOff: ProviderSettingsSnapshot;
  readonly afterDeleteOn: ProviderSettingsSnapshot;
  readonly afterGmail: ProviderSettingsSnapshot;
  readonly afterMailTm: ProviderSettingsSnapshot;
  readonly afterOutlook: ProviderSettingsSnapshot;
}

interface ProviderSettingsSnapshot {
  readonly emailProviderType: string;
  readonly imapHost: string;
  readonly imapMailbox: string;
  readonly imapPort: number;
  readonly imapTls: boolean;
  readonly shouldDeleteSeenEmails: boolean;
}

describe('demo vault provider buttons', () => {
  it('should apply the provider, server and Delete seen emails settings their notes promise', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil } }): Promise<ProviderButtonsResult> {
        interface DemoSetup {
          readonly setDeleteSeenEmails: (this: void, app: unknown, isEnabled: boolean) => Promise<void>;
          readonly useImapServer: (this: void, app: unknown, host: string) => Promise<void>;
          readonly useMailTmProvider: (this: void, app: unknown) => Promise<void>;
        }

        await waitUntil({
          message: 'CodeScript Toolkit never patched require for root-relative modules',
          predicate: () => !!app.plugins.getPlugin('fix-require-modules')
        });
        const demoSetup = window.require('/demoSetup.ts') as DemoSetup;

        async function snapshot(): Promise<ProviderSettingsSnapshot> {
          const data = await app.plugins.getPlugin('email-to-vault')?.loadData() as null | Partial<ProviderSettingsSnapshot>;
          return {
            emailProviderType: data?.emailProviderType ?? '',
            imapHost: data?.imapHost ?? '',
            imapMailbox: data?.imapMailbox ?? '',
            imapPort: data?.imapPort ?? 0,
            imapTls: data?.imapTls ?? false,
            shouldDeleteSeenEmails: data?.shouldDeleteSeenEmails ?? false
          };
        }

        await demoSetup.useImapServer(app, 'imap.gmail.com');
        const afterGmail = await snapshot();
        await demoSetup.useImapServer(app, 'outlook.office365.com');
        const afterOutlook = await snapshot();
        await demoSetup.setDeleteSeenEmails(app, true);
        const afterDeleteOn = await snapshot();
        await demoSetup.setDeleteSeenEmails(app, false);
        const afterDeleteOff = await snapshot();
        await demoSetup.setDeleteSeenEmails(app, true);
        await demoSetup.useMailTmProvider(app);
        const afterMailTm = await snapshot();

        return { afterDeleteOff, afterDeleteOn, afterGmail, afterMailTm, afterOutlook };
      }
    });

    const imapServer = { emailProviderType: 'imap', imapMailbox: 'INBOX', imapPort: 993, imapTls: true };
    expect(result.afterGmail).toMatchObject({ ...imapServer, imapHost: 'imap.gmail.com' });
    expect(result.afterOutlook).toMatchObject({ ...imapServer, imapHost: 'outlook.office365.com' });
    expect(result.afterDeleteOn.shouldDeleteSeenEmails).toBe(true);
    expect(result.afterDeleteOff.shouldDeleteSeenEmails).toBe(false);
    // The reset also turns Delete seen emails back off, which is why it was switched on just before it.
    expect(result.afterMailTm).toMatchObject({ emailProviderType: 'mail-tm', shouldDeleteSeenEmails: false });
  });
});
