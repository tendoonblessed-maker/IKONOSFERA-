/**
 * Fetch with a portable AbortController deadline.
 * Avoid AbortSignal.timeout(), which is missing in some older mobile browsers.
 * The same deadline covers both waiting for response headers and consuming
 * the response body; fetch can resolve before a slow body stream finishes.
 * @param {typeof fetch} fetcher
 * @param {RequestInfo | URL} input
 * @param {RequestInit} init
 * @param {number} [timeoutMs]
 * @param {string} [timeoutMessage]
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(
  fetcher,
  input,
  init,
  timeoutMs = 18000,
  timeoutMessage = 'Запрос не завершился вовремя. Проверь подключение.'
) {
  const controller = new AbortController();
  const timeoutError = new Error(timeoutMessage);
  let timeoutId;
  let rejectDeadline;
  const deadline = new Promise((_, reject) => {
    rejectDeadline = reject;
  });
  const clearDeadline = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };
  timeoutId = setTimeout(() => {
    controller.abort();
    rejectDeadline(timeoutError);
  }, Math.max(1, timeoutMs));

  const withDeadline = async (operation) => {
    try {
      return await Promise.race([operation, deadline]);
    } catch (error) {
      if (controller.signal.aborted) throw new Error(timeoutMessage);
      throw error;
    }
  };

  try {
    const response = await withDeadline(
      Promise.resolve().then(() => fetcher(input, { ...init, signal: controller.signal }))
    );

    // fetch() only resolves after headers arrive. Keep the watchdog alive
    // until the caller has consumed the body, otherwise a stalled stream can
    // leave inbox/auth screens waiting forever after a successful status.
    for (const method of ['arrayBuffer', 'blob', 'formData', 'json', 'text']) {
      const reader = response[method];
      if (typeof reader !== 'function') continue;
      Object.defineProperty(response, method, {
        configurable: true,
        value: (...args) => withDeadline(
          Promise.resolve().then(() => reader.apply(response, args))
        ).finally(clearDeadline)
      });
    }
    return response;
  } catch (error) {
    clearDeadline();
    if (controller.signal.aborted) throw new Error(timeoutMessage);
    throw error;
  }
}
