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


/**
 * Acquire a send lock owned by one signed-in account.
 *
 * The returned object is a snapshot: a late completion from an older account
 * can release only its own lock, never the next account's lock.
 *
 * @typedef {{ ownerId: string, active: boolean }} AccountInFlightLock
 * @typedef {{ current: AccountInFlightLock }} AccountInFlightLockRef
 */

/**
 * @param {AccountInFlightLockRef} ref
 * @param {string} ownerId
 * @returns {AccountInFlightLock | null}
 */
export function tryAcquireAccountInFlightLock(ref, ownerId) {
  if (!ownerId) return null;
  if (ref.current.ownerId !== ownerId) {
    ref.current = { ownerId, active: false };
  }
  const lock = ref.current;
  return tryAcquireInFlightLock(lock) ? lock : null;
}
