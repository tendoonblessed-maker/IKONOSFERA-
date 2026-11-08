/**
 * Coalesce short bursts of Realtime wake-up hints before triggering
 * authoritative HTTPS refreshes. Only event kinds are retained; payloads
 * and message content never enter this queue.
 */
export function createRealtimeWakeup<T>(
  callback: (kind: T) => void,
  windowMs = 75
): { notify: (kind: T) => void; dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const pending = new Set<T>();

  const flush = () => {
    timer = null;
    if (disposed) {
      pending.clear();
      return;
    }
    const kinds = [...pending];
    pending.clear();
    for (const kind of kinds) {
      // A callback may synchronously unmount its owner and dispose this
      // wake-up queue. Do not deliver the rest of that already-captured batch.
      if (disposed) break;
      callback(kind);
    }
  };

  return {
    notify(kind: T) {
      if (disposed) return;
      pending.add(kind);
      if (timer !== null) return;
      timer = setTimeout(flush, Math.max(0, windowMs));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending.clear();
    }
  };
}
