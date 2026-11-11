/**
 * Fetch with a portable AbortController deadline.
 * Avoid AbortSignal.timeout(), which is missing in some older mobile browsers.
 * The same deadline covers both waiting for response headers and consuming
 * the response body; fetch can resolve before a slow body stream finishes.
 * A caller-provided init.signal is bridged into the owned controller so
 * lifecycle cancellation remains distinguishable from a deadline timeout.
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
  const externalSignal = init?.signal;
  const timeoutError = new Error(timeoutMessage);
  timeoutError.name = 'TimeoutError';
  let timeoutId;
  let timedOut = false;
  let externallyAborted = false;
  let externalAbortReason;
  let rejectDeadline;
  let rejectExternalAbort;
  const deadline = new Promise((_, reject) => {
    rejectDeadline = reject;
  });
  const externalAbort = new Promise((_, reject) => {
    rejectExternalAbort = reject;
  });
  // The promise is also raced by every body reader. Mark it handled now so an
  // abort between headers and body consumption cannot create an unhandled
  // rejection while the caller is deciding which response method to use.
  externalAbort.catch(() => {});

  const clearDeadline = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    externalSignal?.removeEventListener('abort', onExternalAbort);
  };

  const onExternalAbort = () => {
    if (externallyAborted || timedOut) return;
    externallyAborted = true;
    externalAbortReason = externalSignal?.reason;
    if (externalAbortReason === undefined) {
      externalAbortReason = new Error('The operation was aborted.');
      externalAbortReason.name = 'AbortError';
    }
    controller.abort();
    clearDeadline();
    rejectExternalAbort(externalAbortReason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      // Close the small race between the first check and listener registration.
      if (externalSignal.aborted) onExternalAbort();
    }
  }

  if (!externallyAborted) {
    timeoutId = setTimeout(() => {
      if (externallyAborted) return;
      timedOut = true;
      controller.abort();
      clearDeadline();
      rejectDeadline(timeoutError);
    }, Math.max(1, timeoutMs));
  }

  const withDeadline = async (operation) => {
    try {
      return await Promise.race([operation, deadline, externalAbort]);
    } catch (error) {
      if (timedOut) throw timeoutError;
      if (externallyAborted) throw externalAbortReason;
      throw error;
    }
  };

  try {
    // A caller may cancel before this function is entered. Do not invoke a
    // transport at all in that case: custom fetchers and mutating requests
    // must not observe a request that was already canceled.
    if (externallyAborted) throw externalAbortReason;

    // Invoke fetcher synchronously, preserving the existing single-flight
    // Auth refresh contract while still racing its result against the deadline.
    const request = fetcher(input, { ...init, signal: controller.signal });
    const response = await withDeadline(Promise.resolve(request));

    // fetch() only resolves after headers arrive. Keep the watchdog alive
    // until the caller has consumed the body, otherwise a stalled stream can
    // leave inbox/auth screens waiting forever after a successful status.
    for (const method of ['arrayBuffer', 'blob', 'formData', 'json', 'text']) {
      const reader = response[method];
      if (typeof reader !== 'function') continue;
      Object.defineProperty(response, method, {
        configurable: true,
        value: (...args) => {
          let body;
          try {
            body = reader.apply(response, args);
          } catch (error) {
            clearDeadline();
            throw error;
          }
          return withDeadline(Promise.resolve(body)).finally(clearDeadline);
        }
      });
    }
    return response;
  } catch (error) {
    clearDeadline();
    if (timedOut) throw timeoutError;
    if (externallyAborted) throw externalAbortReason;
    throw error;
  }
}
