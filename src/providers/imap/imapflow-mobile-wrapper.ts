import type { ImapFlowWrapper } from './imapflow-wrapper.ts';

const IMAP_NOT_AVAILABLE_ON_MOBILE = 'IMAP is not available on mobile devices';

export function buildWrapper(): ImapFlowWrapper {
  return {
    connect: () => throwNotAvailable(),
    download: () => throwNotAvailable(),
    fetch: () => throwNotAvailable(),
    fetchOne: () => throwNotAvailable(),
    getMailboxLock: () => throwNotAvailable(),
    logout: () => throwNotAvailable(),
    messageDelete: () => throwNotAvailable(),
    messageFlagsAdd: () => throwNotAvailable()
  };
}

function throwNotAvailable(): never {
  throw new Error(IMAP_NOT_AVAILABLE_ON_MOBILE);
}
