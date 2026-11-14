export function controllerChangeResult(wasControlled: boolean) {
  return { controlled: true as const, updateAvailable: wasControlled };
}

export function shouldShowWaitingServiceWorkerUpdate(
  wasControlled: boolean,
  hasWaitingWorker: boolean,
): boolean {
  return wasControlled && hasWaitingWorker;
}
