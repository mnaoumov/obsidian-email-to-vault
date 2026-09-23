/**
 * @file
 *
 * The budgets the two screenshot-capture suites and their vitest project share.
 *
 * They live here rather than in either suite because the relationship between
 * them is the whole point, and it has to be arithmetic rather than a comment:
 * **a helper's own budget must be strictly under the per-test budget**, or the
 * helper's message can never be printed. Before this file,
 * `CAPTURE_TEST_TIMEOUT_IN_MILLISECONDS` was 180 s in `scripts/vitest-config.ts`
 * while `fetchEmails` looped 24 times at ~9.6 s an attempt — ~230 s — so its
 * `The plugin never created a note for: …` was unreachable by construction and
 * every slow delivery surfaced as a bare `Test timed out in 180000ms` naming the
 * `it` instead of the wait.
 *
 * And `scripts/` rather than `src/`, because the coverage `include` is
 * `src/**\/*.ts`: a constants module there would be counted by the coverage
 * report and never loaded by the unit suites that produce it.
 */

/**
 * How long a capture test will wait for one message to cross the real world:
 * sent over SMTP by the `.env` account, delivered to the disposable Mail.tm
 * mailbox, then fetched by the plugin.
 *
 * **Measured on 2026-09-20, that took 261 s** — one message sent from the `.env`
 * account to a Mail.tm mailbox and polled every 5 s until it appeared, with the
 * account creation and the token call both answering in under a second, so the
 * whole 261 s was inbound delivery.
 *
 * 450 s is 1.7x that. Any single number here is picked against one measurement,
 * which is why the measurement is written down beside it — but note what kind of
 * number it is: **a ceiling on a third-party service, not a target.** Nothing
 * gets slower because the ceiling is high; a healthy delivery still returns on
 * its first poll. What a high ceiling costs is the time a genuinely undelivered
 * message takes to be reported, and that is the right thing to spend, because
 * the alternative — the 180 s that was here — reported a slow mailbox as a
 * broken suite.
 */
export const DELIVERY_BUDGET_IN_MILLISECONDS = 450_000;

/**
 * How long a capture test will wait for the plugin to re-write mail it has
 * ALREADY fetched into a different folder, after the templates change.
 *
 * Deliberately not {@link DELIVERY_BUDGET_IN_MILLISECONDS}: nothing crosses the
 * network here. The mail is in the vault, the plugin is reloaded, and
 * `redownload-all-emails` writes it out again — so a wait that runs long here
 * means the plugin or the reload is wrong, which is a defect in this repo and
 * should be reported quickly rather than sat on for the delivery budget.
 */
export const REDOWNLOAD_BUDGET_IN_MILLISECONDS = 90_000;

/**
 * Everything in a capture test that is NOT the wait above: sending the message,
 * opening the note, expanding the tree, capturing the frame and captioning it.
 *
 * Wide on purpose. The measured worst case is well under a minute, and the
 * margin is what guarantees the invariant this file exists for — a helper that
 * overshoots its own deadline by one poll interval still throws its own message
 * rather than being cut off by vitest.
 */
const CAPTURE_TEST_OVERHEAD_IN_MILLISECONDS = 150_000;

/**
 * The per-test budget for both capture suites — **derived, never written down.**
 *
 * Deriving it is what keeps the invariant true: raise a wait budget above and
 * this rises with it, so the helper's diagnostic cannot silently become
 * unreachable again.
 */
export const CAPTURE_TEST_TIMEOUT_IN_MILLISECONDS = DELIVERY_BUDGET_IN_MILLISECONDS + CAPTURE_TEST_OVERHEAD_IN_MILLISECONDS;
