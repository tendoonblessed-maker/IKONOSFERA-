export const BEFORE_APP_UPDATE_EVENT = 'ikonosfera:before-app-update';
export const SERVICE_WORKER_UPDATE_CHECK_TIMEOUT_MS = 20_000;

/** Run synchronous draft persistence before navigating to the new app shell. */
export function reloadAfterPersistingDrafts(persist: () => void, reload: () => void): void {
  persist();
  reload();
}

export function controllerChangeResult(wasControlled: boolean) {
  return { controlled: true as const, updateAvailable: wasControlled };
}

export function shouldShowWaitingServiceWorkerUpdate(
  wasControlled: boolean,
  hasWaitingWorker: boolean,
): boolean {
  return wasControlled && hasWaitingWorker;
}

/** A newly installed worker is an update only when an older worker already controls this page. */
export function shouldAnnounceInstalledWorkerUpdate(
  wasControlled: boolean,
  workerState: string,
  hasWaitingWorker: boolean,
): boolean {
  return wasControlled && workerState === 'installed' && hasWaitingWorker;
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

/**
 * Coalesce overlapping browser lifecycle events into one update() request.
 * A browser update() promise that never settles must not permanently disable
 * future checks. The timeout releases only its own in-flight slot; a late
 * settlement from that request cannot clear a newer request's slot.
 */
export function createServiceWorkerUpdateChecker(
  timeoutMs = SERVICE_WORKER_UPDATE_CHECK_TIMEOUT_MS,
) {
  let inFlight: Promise<void> | null = null;

  return (update: () => Promise<unknown>): Promise<void> => {
    if (inFlight) return inFlight;

    let resolveAttempt!: () => void;
    let completed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = new Promise<void>((resolve) => {
      resolveAttempt = resolve;
    });
    inFlight = attempt;

    const finish = () => {
      if (completed) return;
      completed = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (inFlight === attempt) inFlight = null;
      resolveAttempt();
    };

    const safeTimeout = Number.isFinite(timeoutMs)
      ? Math.max(0, timeoutMs)
      : SERVICE_WORKER_UPDATE_CHECK_TIMEOUT_MS;
    timer = setTimeout(finish, safeTimeout);

    // Promise.resolve also converts synchronous update() throws into a
    // settled attempt, so the next visibility/focus/online signal can retry.
    void Promise.resolve().then(update).then(finish, finish);

    return attempt;
  };
}
