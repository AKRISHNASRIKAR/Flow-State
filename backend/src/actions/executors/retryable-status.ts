/**
 * Whether an HTTP error status is worth retrying. Timeouts, rate limits and
 * server errors can clear up; any other 4xx is the request itself being
 * wrong (bad URL, auth, chat id, payload), so repeating it only delays the
 * failure.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}
