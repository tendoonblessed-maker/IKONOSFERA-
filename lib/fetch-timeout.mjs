/**
 * Fetch with a portable AbortController deadline.
 * Avoid AbortSignal.timeout(), which is missing in some older mobile browsers.
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
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(timeoutMessage);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
