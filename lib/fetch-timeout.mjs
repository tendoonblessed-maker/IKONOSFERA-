/**
 * Run a fetch operation under a portable AbortController deadline.
 * Older mobile browsers may not implement AbortSignal.timeout().
 */
async function withDeadline(operation,upstreamSignal,timeoutMs,timeoutMessage){
  const controller = new AbortController();
  let timedOut = false;
  let onUpstreamAbort = null;

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort();
    } else {
      onUpstreamAbort = () => controller.abort();
      upstreamSignal.addEventListener('abort', onUpstreamAbort);
    }
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1, timeoutMs));

  try {
    const result = await operation(controller.signal);
    if (timedOut) throw new Error(timeoutMessage);
    return result;
  } catch (error) {
    if (timedOut) throw new Error(timeoutMessage);
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (upstreamSignal && onUpstreamAbort) {
      upstreamSignal.removeEventListener('abort', onUpstreamAbort);
    }
  }
}

/**
 * Fetch with a portable AbortController deadline.
 * @param {typeof fetch} fetcher
 * @param {RequestInfo | URL} input
 * @param {RequestInit} [init]
 * @param {number} [timeoutMs]
 * @param {string} [timeoutMessage]
 * @returns {Promise<Response>}
 */
export function fetchWithTimeout(
  fetcher,
  input,
  init = {},
  timeoutMs = 18000,
  timeoutMessage = 'Запрос не завершился вовремя. Проверь подключение.'
) {
  return withDeadline(
    signal => fetcher(input, { ...init, signal }),
    init.signal,
    timeoutMs,
    timeoutMessage
  );
}

/**
 * Fetch and consume a JSON response before the deadline is cleared.
 * A stalled response body is therefore bounded just like a stalled request.
 * @param {typeof fetch} fetcher
 * @param {RequestInfo | URL} input
 * @param {RequestInit} [init]
 * @param {number} [timeoutMs]
 * @param {string} [timeoutMessage]
 * @returns {Promise<{response: Response, data: unknown}>}
 */
export function fetchJsonWithTimeout(
  fetcher,
  input,
  init = {},
  timeoutMs = 18000,
  timeoutMessage = 'Запрос не завершился вовремя. Проверь подключение.'
) {
  return withDeadline(async signal => {
    const response = await fetcher(input, { ...init, signal });
    const data = await response.json().catch(() => null);
    return { response, data };
  }, init.signal, timeoutMs, timeoutMessage);
}
