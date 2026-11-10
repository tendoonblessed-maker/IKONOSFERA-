export const SOCIAL_READ_TIMEOUT_MS = 18_000;

/**
 * Bound one read-only social API operation, including response-body parsing.
 *
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} operation
 * @param {number} [timeoutMs]
 * @returns {Promise<T>}
 */
export async function withSocialReadDeadline(operation, timeoutMs = SOCIAL_READ_TIMEOUT_MS) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error(
        "Сервер социальных данных не ответил вовремя. Проверь подключение и повтори попытку."
      );
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
