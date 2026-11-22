/**
 * Combine caller cancellation with a bounded request timeout.
 *
 * Use AbortController and a timer rather than newer static AbortSignal
 * composition helpers, which are missing in some older mobile browsers.
 *
 * @param {AbortSignal | undefined} callerSignal
 * @param {number} timeoutMs
 * @returns {{ signal: AbortSignal, dispose: () => void }}
 */
export function createRequestAbortSignal(callerSignal, timeoutMs = 18000) {
  const controller = new AbortController();
  let timeoutId = null;
  let disposed = false;
  const abortFromCaller = () => {
    if (controller.signal.aborted) return;
    const reason = callerSignal?.reason;
    if (reason !== undefined) controller.abort(reason);
    else controller.abort();
  };
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  if (!controller.signal.aborted) {
    const delay = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 18000;
    timeoutId = setTimeout(() => {
      if (controller.signal.aborted) return;
      const error = new Error('The request timed out');
      error.name = 'TimeoutError';
      controller.abort(error);
    }, delay);
  }
  return {
    signal: controller.signal,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  };
}
