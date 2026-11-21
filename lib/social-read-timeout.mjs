export const SOCIAL_READ_TIMEOUT_MS = 18_000;

/**
 * Bound a read-only social API request without relying on AbortSignal.timeout(),
 * which is missing in some older mobile Safari / WebView versions.
 *
 * The callback must keep all response-body parsing inside this scope so a stalled
 * body is covered by the same deadline as the initial fetch.
 */
export async function withSocialReadTimeout(operation, timeoutMs = SOCIAL_READ_TIMEOUT_MS) {
  if (typeof operation !== 'function') throw new TypeError('operation must be a function');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('timeoutMs must be positive');

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const timeoutError = () => new Error('Сервер не ответил вовремя. Проверь соединение и повтори запрос.');

  try {
    const result = await operation(controller.signal);
    if (timedOut) throw timeoutError();
    return result;
  } catch (error) {
    if (timedOut) throw timeoutError();
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
