/**
 * Synchronous guard for event handlers that can fire twice before React commits
 * the state update that disables the submit control.
 *
 * @typedef {{ active: boolean }} InFlightLock
 */

/** @param {InFlightLock} lock */
export function tryAcquireInFlightLock(lock) {
  if (lock.active) return false;
  lock.active = true;
  return true;
}

/** @param {InFlightLock} lock */
export function releaseInFlightLock(lock) {
  lock.active = false;
}
