export function controllerChangeResult(wasControlled: boolean) {
  return { controlled: true as const, updateAvailable: wasControlled };
}

export function shouldShowWaitingServiceWorkerUpdate(
  wasControlled: boolean,
  hasWaitingWorker: boolean,
): boolean {
  return wasControlled && hasWaitingWorker;
}

export function shouldCheckServiceWorkerUpdate(state: {
  disposed: boolean;
  controlled: boolean;
  visible: boolean;
  online: boolean;
  updateAvailable: boolean;
}): boolean {
  return !state.disposed &&
    state.controlled &&
    state.visible &&
    state.online &&
    !state.updateAvailable;
}

/** Coalesce overlapping browser lifecycle events into one update() request. */
export function createServiceWorkerUpdateChecker() {
  let inFlight: Promise<void> | null = null;

  return (update: () => Promise<unknown>): Promise<void> => {
    if (inFlight) return inFlight;

    inFlight = Promise.resolve()
      .then(update)
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
}
