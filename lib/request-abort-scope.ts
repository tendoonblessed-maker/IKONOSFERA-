/**
 * Owns the currently active read request for a polling lifecycle.
 * Pausing or unmounting aborts the fetch; the timeout preserves the existing
 * 18-second request deadline. A late finally from an older request cannot
 * clear a newer controller.
 */
type ActiveRequest = {
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
};

export function createAbortableRequestScope(timeoutMs = 18_000) {
  let active: ActiveRequest | null = null;

  const abortActive = () => {
    if (!active) return;
    const previous = active;
    active = null;
    clearTimeout(previous.timeout);
    previous.controller.abort();
  };

  return {
    begin(): AbortController {
      abortActive();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      active = { controller, timeout };
      return controller;
    },

    abort(): void {
      abortActive();
    },

    clear(controller: AbortController): void {
      if (active?.controller !== controller) return;
      clearTimeout(active.timeout);
      active = null;
    },
  };
}
