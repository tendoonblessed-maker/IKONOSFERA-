export const SOCIAL_READ_TIMEOUT_MS = 18_000;

/**
 * Bound one read-only social API operation, including response-body parsing.
 *
 * AbortController cancels native fetch work; Promise.race also bounds the
 * caller's wait when a custom operation or body reader ignores the signal.
 *
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} operation
 * @param {number} [timeoutMs]
 * @returns {Promise<T>}
 */
export async function withSocialReadDeadline(operation, timeoutMs = SOCIAL_READ_TIMEOUT_MS) {
  const controller = new AbortController();
  let timer;

  const timeoutError = () => {
    const error = new Error(
      "Сервер социальных данных не ответил вовремя. Проверь подключение и повтори попытку."
    );
    error.name = "TimeoutError";
    return error;
  };

  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = timeoutError();
      try {
        controller.abort();
      } finally {
        reject(error);
      }
    }, timeoutMs);
  });

  try {
    // The race is intentional: AbortSignal is cooperative, so an operation
    // that ignores it must not keep the UI waiting beyond the deadline.
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      deadline
    ]);
  } finally {
    clearTimeout(timer);
  }
}
