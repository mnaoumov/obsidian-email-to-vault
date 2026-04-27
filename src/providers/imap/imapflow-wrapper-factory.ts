import type { ImapFlowOptions } from 'imapflow';

import { Platform } from 'obsidian';

import type {
  ImapFlowWrapper,
  ImapFlowWrapperModule
} from './imapflow-wrapper.ts';

export async function buildImapFlowWrapper(options: ImapFlowOptions): Promise<ImapFlowWrapper> {
  let module: ImapFlowWrapperModule;

  if (Platform.isDesktop) {
    // eslint-disable-next-line no-restricted-syntax -- conditional loading to avoid bundling imapflow on mobile
    module = await import('./imapflow-desktop-wrapper.ts');
  } else {
    // eslint-disable-next-line no-restricted-syntax -- conditional loading for mobile stub
    module = await import('./imapflow-mobile-wrapper.ts');
  }

  return module.buildWrapper(options);
}
