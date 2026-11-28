/**
 * What the status bar item shows: the state of the last email check and when the next one is due.
 */
export interface EmailCheckStatus {
  readonly isChecking: boolean;
  readonly lastCheckAt: Date | null;
  // Why the last check failed, in words a user can read; `null` when it succeeded.
  readonly lastError: null | string;
  // How many notes the last successful check created; `null` before the first one.
  readonly lastNewEmailCount: null | number;
  // `null` when automatic checks are off.
  readonly nextCheckAt: Date | null;
}

export const INITIAL_EMAIL_CHECK_STATUS: EmailCheckStatus = {
  isChecking: false,
  lastCheckAt: null,
  lastError: null,
  lastNewEmailCount: null,
  nextCheckAt: null
};

const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/**
 * Formats the short text the status bar item shows, such as `2 new · 5 min ago · next in 5 min`.
 *
 * @param status - The status.
 * @param now - The current time.
 * @returns The text.
 */
export function formatEmailCheckStatusText(status: EmailCheckStatus, now: Date): string {
  if (status.isChecking) {
    return 'Checking emails…';
  }

  const lastCheckParts = status.lastCheckAt === null
    ? ['Not checked yet']
    : [status.lastError === null ? formatNewEmailCount(status.lastNewEmailCount) : 'Check failed', formatTimeAgo(status.lastCheckAt, now)];
  const nextCheckPart = status.nextCheckAt === null ? 'auto-check off' : `next ${formatTimeUntil(status.nextCheckAt, now)}`;
  return [...lastCheckParts, nextCheckPart].join(' · ');
}

/**
 * Formats the tooltip of the status bar item: the full state, one fact per line.
 *
 * @param status - The status.
 * @param now - The current time.
 * @returns The tooltip.
 */
export function formatEmailCheckStatusTooltip(status: EmailCheckStatus, now: Date): string {
  const checkingLines = status.isChecking ? ['Checking emails now.'] : [];
  const lastCheckLines = status.lastCheckAt === null
    ? ['Last check: none yet']
    : [
      `Last check: ${formatClockTime(status.lastCheckAt)} (${formatTimeAgo(status.lastCheckAt, now)})`,
      status.lastError === null ? `Saved ${formatSavedEmailCount(status.lastNewEmailCount)}` : `Last error: ${status.lastError}`
    ];
  const nextCheckLine = status.nextCheckAt === null
    ? 'Next check: none, automatic checks are off'
    : `Next check: ${formatClockTime(status.nextCheckAt)} (${formatTimeUntil(status.nextCheckAt, now)})`;
  return ['Email to Vault', ...checkingLines, ...lastCheckLines, nextCheckLine, 'Click to check emails now'].join('\n');
}

function formatClockTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(milliseconds: number): null | string {
  const minutes = Math.floor(milliseconds / MILLISECONDS_PER_MINUTE);
  if (minutes < 1) {
    return null;
  }
  if (minutes < MINUTES_PER_HOUR) {
    return `${String(minutes)} min`;
  }
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  return hours < HOURS_PER_DAY ? `${String(hours)} h` : `${String(Math.floor(hours / HOURS_PER_DAY))} d`;
}

function formatNewEmailCount(count: null | number): string {
  return count ? `${String(count)} new` : 'No new';
}

function formatSavedEmailCount(count: null | number): string {
  const value = count ?? 0;
  return `${String(value)} new email${value === 1 ? '' : 's'}`;
}

function formatTimeAgo(date: Date, now: Date): string {
  const duration = formatDuration(now.getTime() - date.getTime());
  return duration === null ? 'just now' : `${duration} ago`;
}

function formatTimeUntil(date: Date, now: Date): string {
  const duration = formatDuration(date.getTime() - now.getTime());
  return duration === null ? 'in under a minute' : `in ${duration}`;
}
