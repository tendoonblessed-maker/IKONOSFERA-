const RETRYABLE_HISTORY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_RETRY_DELAY_MS = 250;
const MAX_AUTOMATIC_RETRY_DELAY_MS = 3000;

/**
 * Convert Retry-After (delta-seconds or HTTP date) to a bounded delay.
 * A null result means the server asked us to wait too long for an automatic retry.
 * @param {string | null | undefined} value
 * @param {number} [now]
 * @returns {number | null}
 */
export function historyRetryDelayMs(value, now = Date.now()) {
  const raw = typeof value === 'string' ? value.trim() : '';
  let delay = DEFAULT_RETRY_DELAY_MS;

  if (raw) {
    if (/^\d+(?:\.\d+)?$/.test(raw)) {
      delay = Math.ceil(Number(raw) * 1000);
    } else {
      const retryAt = Date.parse(raw);
      if (Number.isFinite(retryAt)) delay = Math.max(0, retryAt - now);
    }
  }

  if (!Number.isFinite(delay) || delay < 0) delay = DEFAULT_RETRY_DELAY_MS;
  return delay > MAX_AUTOMATIC_RETRY_DELAY_MS ? null : delay;
}

/**
 * Retry one idempotent chat-history GET once after a transient failure.
 * The request callback is deliberately reused unchanged so a keyset cursor,
 * JWT and URL cannot drift between attempts.
 *
 * @template T
 * @param {() => Promise<T>} request
 * @param {{ sleep?: (milliseconds: number) => Promise<void>, now?: () => number }} [options]
 * @returns {Promise<T>}
 */
export async function retryTransientHistoryRead(request, options = {}) {
  try {
    return await request();
  } catch (error) {
    const name = error && typeof error === 'object' ? error.name : '';
    if (name === 'AbortError' || name === 'TimeoutError') throw error;

    const status = error && typeof error === 'object' ? error.status : undefined;
    const retryable = Number.isInteger(status)
      ? RETRYABLE_HISTORY_STATUSES.has(status)
      : name === 'TypeError';
    if (!retryable) throw error;

    const retryAfter = error && typeof error === 'object' ? error.retryAfter : null;
    const delay = historyRetryDelayMs(retryAfter, options.now?.() ?? Date.now());
    if (delay === null) throw error;

    if (delay > 0) {
      const sleep = options.sleep ?? (milliseconds =>
        new Promise(resolve => setTimeout(resolve, milliseconds)));
      await sleep(delay);
    }
    return request();
  }
}
