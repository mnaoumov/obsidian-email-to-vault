import type { ImapFlowOptions } from 'imapflow';

import { ImapFlow } from 'imapflow';

import type { ImapFlowWrapper } from './imapflow-wrapper.ts';

export function buildWrapper(options: ImapFlowOptions): ImapFlowWrapper {
  const client = new ImapFlow(options);
  return {
    connect: (): Promise<void> => client.connect(),
    download: (...args): ReturnType<ImapFlowWrapper['download']> => client.download(...args),
    fetch: (...args): ReturnType<ImapFlowWrapper['fetch']> => client.fetch(...args),
    fetchOne: (...args): ReturnType<ImapFlowWrapper['fetchOne']> => client.fetchOne(...args),
    getMailboxLock: (...args): ReturnType<ImapFlowWrapper['getMailboxLock']> => client.getMailboxLock(...args),
    logout: (): Promise<void> => client.logout(),
    messageDelete: (...args): ReturnType<ImapFlowWrapper['messageDelete']> => client.messageDelete(...args),
    messageFlagsAdd: (...args): ReturnType<ImapFlowWrapper['messageFlagsAdd']> => client.messageFlagsAdd(...args)
  };
}
