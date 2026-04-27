import type {
  DownloadObject,
  FetchMessageObject,
  FetchOptions,
  FetchQueryObject,
  ImapFlowOptions,
  MailboxLockObject,
  MessageAddressObject,
  MessageStructureObject,
  SearchObject,
  SequenceString,
  StoreOptions
} from 'imapflow';

export type {
  DownloadObject,
  FetchMessageObject,
  FetchOptions,
  FetchQueryObject,
  ImapFlowOptions,
  MailboxLockObject,
  MessageAddressObject,
  MessageStructureObject,
  SearchObject,
  SequenceString,
  StoreOptions
};

export interface DownloadOptions {
  chunkSize?: number;
  maxBytes?: number;
  uid?: boolean;
}

export interface ImapFlowWrapper {
  connect(): Promise<void>;
  download(range: SequenceString, part?: string, options?: DownloadOptions): Promise<DownloadObject>;
  fetch(range: number[] | SearchObject | SequenceString, query: FetchQueryObject, options?: FetchOptions): AsyncIterableIterator<FetchMessageObject>;
  fetchOne(seq: SequenceString, query: FetchQueryObject, options?: FetchOptions): Promise<false | FetchMessageObject>;
  getMailboxLock(path: string | string[]): Promise<MailboxLockObject>;
  logout(): Promise<void>;
  messageDelete(range: number[] | SearchObject | SequenceString, options?: UidOptions): Promise<boolean>;
  messageFlagsAdd(range: number[] | SearchObject | SequenceString, flags: string[], options?: StoreOptions): Promise<boolean>;
}

export interface ImapFlowWrapperModule {
  buildWrapper(options: ImapFlowOptions): ImapFlowWrapper;
}

export interface UidOptions {
  uid?: boolean;
}
