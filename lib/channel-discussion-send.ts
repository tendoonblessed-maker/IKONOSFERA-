export type SendThenRefreshResult<T> =
  | { value: T; refreshed: true }
  | { value: T; refreshed: false; refreshError: unknown };

/**
 * A synchronous single-flight gate for UI mutations. The lock is acquired
 * before the operation's first microtask so two taps in one render cannot
 * submit the same content twice.
 */
export function createSingleFlightGate() {
  let inFlight = false;
  return {
    run<T>(operation: () => Promise<T>): Promise<T> | null {
      if (inFlight) return null;
      inFlight = true;
      return Promise.resolve()
        .then(operation)
        .finally(() => {
          inFlight = false;
        });
    },
  };
}

/**
 * Separate a confirmed write from its best-effort UI refresh. Once send()
 * resolves, onSent() runs exactly once; refresh failures are reported as
 * stale UI, not as a failed send that invites the user to submit again.
 */
export async function sendThenRefresh<T>(
  send: () => Promise<T>,
  onSent: () => void,
  refresh: () => Promise<unknown>,
): Promise<SendThenRefreshResult<T>> {
  const value = await send();
  onSent();
  try {
    await refresh();
    return { value, refreshed: true };
  } catch (refreshError) {
    return { value, refreshed: false, refreshError };
  }
}
