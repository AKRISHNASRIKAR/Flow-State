/**
 * Admission-control limits, shared by both engines so a run refused on one
 * would be refused on the other. Framework-free on purpose.
 */

/**
 * A runaway or misconfigured workflow (e.g. a webhook sender retrying in a
 * tight loop) must not queue unbounded work for itself and starve others.
 */
export const MAX_CONCURRENT_EXECUTIONS_PER_WORKFLOW = 3;

/** Fixed hourly window, keyed by user. */
export const MAX_EXECUTIONS_PER_USER_PER_HOUR = 100;
