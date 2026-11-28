import dedent from 'dedent';
import {
  describe,
  expect,
  it
} from 'vitest';

import type { EmailCheckStatus } from './email-check-status.ts';

import {
  formatEmailCheckStatusText,
  formatEmailCheckStatusTooltip,
  INITIAL_EMAIL_CHECK_STATUS
} from './email-check-status.ts';

const NOW = new Date('2026-11-27T10:00:00.000Z');
const MILLISECONDS_PER_MINUTE = 60_000;

function clock(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function minutesFromNow(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * MILLISECONDS_PER_MINUTE);
}

function status(changes: Partial<EmailCheckStatus>): EmailCheckStatus {
  return { ...INITIAL_EMAIL_CHECK_STATUS, ...changes };
}

describe('formatEmailCheckStatusText', () => {
  it('should say a check is running', () => {
    expect(formatEmailCheckStatusText(status({ isChecking: true }), NOW)).toBe('Checking emails…');
  });

  it('should say nothing was checked yet and that automatic checks are off', () => {
    expect(formatEmailCheckStatusText(INITIAL_EMAIL_CHECK_STATUS, NOW)).toBe('Not checked yet · auto-check off');
  });

  it('should give the new email count, when the last check ran and when the next is due', () => {
    expect(formatEmailCheckStatusText(
      status({
        lastCheckAt: minutesFromNow(-5),
        lastNewEmailCount: 2,
        nextCheckAt: minutesFromNow(5)
      }),
      NOW
    )).toBe('2 new · 5 min ago · next in 5 min');
  });

  it('should say no new emails were found', () => {
    expect(formatEmailCheckStatusText(
      status({
        lastCheckAt: NOW,
        lastNewEmailCount: 0,
        nextCheckAt: minutesFromNow(0.5)
      }),
      NOW
    )).toBe('No new · just now · next in under a minute');
  });

  it('should say the last check failed', () => {
    expect(formatEmailCheckStatusText(
      status({
        lastCheckAt: minutesFromNow(-90),
        lastError: 'could not reach the server',
        nextCheckAt: minutesFromNow(3 * 24 * 60)
      }),
      NOW
    )).toBe('Check failed · 1 h ago · next in 3 d');
  });
});

describe('formatEmailCheckStatusTooltip', () => {
  it('should list a running check that was never checked before and the automatic checks being off', () => {
    expect(formatEmailCheckStatusTooltip(status({ isChecking: true }), NOW)).toBe(dedent`
      Email to Vault
      Checking emails now.
      Last check: none yet
      Next check: none, automatic checks are off
      Click to check emails now
    `);
  });

  it('should list the last check, the saved count and the next check', () => {
    const lastCheckAt = minutesFromNow(-5);
    const nextCheckAt = minutesFromNow(5);
    expect(formatEmailCheckStatusTooltip(status({ lastCheckAt, lastNewEmailCount: 1, nextCheckAt }), NOW)).toBe(dedent`
      Email to Vault
      Last check: ${clock(lastCheckAt)} (5 min ago)
      Saved 1 new email
      Next check: ${clock(nextCheckAt)} (in 5 min)
      Click to check emails now
    `);
  });

  it('should count zero saved emails in the plural', () => {
    expect(formatEmailCheckStatusTooltip(status({ lastCheckAt: NOW, lastNewEmailCount: 0 }), NOW)).toContain('Saved 0 new emails');
  });

  it('should count a missing saved count as zero', () => {
    expect(formatEmailCheckStatusTooltip(status({ lastCheckAt: NOW }), NOW)).toContain('Saved 0 new emails');
  });

  it('should give the last error', () => {
    expect(formatEmailCheckStatusTooltip(status({ lastCheckAt: NOW, lastError: 'could not reach the server' }), NOW))
      .toContain('Last error: could not reach the server');
  });
});
