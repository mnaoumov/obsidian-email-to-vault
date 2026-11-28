import { waitForAllAsyncOperations } from '@mnaoumov/typescript-test-toolkit/async-operation-tracking';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { EmailCheckerComponent } from '../email-checker.ts';

import { TestConnectionCommandHandler } from './test-connection-command-handler.ts';

function createMockEmailChecker(): EmailCheckerComponent {
  return strictProxy<EmailCheckerComponent>({
    testConnection: vi.fn()
  });
}

describe('TestConnectionCommandHandler', () => {
  it('should have correct command properties', () => {
    const command = new TestConnectionCommandHandler(createMockEmailChecker());

    const builtCommand = command.buildCommand();
    expect(builtCommand.id).toBe('test-connection');
    expect(builtCommand.name).toBe('Test connection');
    expect(builtCommand.icon).toBe('plug-zap');
  });

  it('should call testConnection on execute', async () => {
    const checker = createMockEmailChecker();
    const command = new TestConnectionCommandHandler(checker);

    command.buildCommand().checkCallback?.(false);
    await waitForAllAsyncOperations();

    expect(checker.testConnection).toHaveBeenCalledOnce();
  });
});
