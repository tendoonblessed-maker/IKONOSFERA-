/**
 * Coalesce session/inbox refreshes without losing a forced reconciliation
 * requested while an older network refresh is still in flight.
 *
 * A resume event can arrive before the previous request settles. The caller
 * queues one full refresh and runs it as soon as the current task releases
 * the gate; multiple visibility/online events collapse into one refresh.
 */
export function createSingleFlightRefreshGate() {
  let active = false;
  let queuedFull = false;
  let disposed = false;

  return {
    enter(forceFull = false): { accepted: boolean; forceFull: boolean } {
      if (disposed) return { accepted: false, forceFull: false };
      if (active) {
        if (forceFull) queuedFull = true;
        return { accepted: false, forceFull: false };
      }

      active = true;
      const runFull = forceFull || queuedFull;
      queuedFull = false;
      return { accepted: true, forceFull: runFull };
    },

    /**
     * Release the current task. A true result means a forced refresh was
     * requested while it ran. Keep it queued until the caller can actually
     * run it (the document may still be hidden/offline).
     */
    leave(): boolean {
      if (!active) return false;
      active = false;
      return !disposed && queuedFull;
    },

    dispose(): void {
      disposed = true;
      queuedFull = false;
    },
  };
}
