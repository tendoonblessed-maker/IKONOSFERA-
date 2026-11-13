type SessionIdentity = {
  access_token: string;
  refresh_token: string;
} | null | undefined;

/**
 * A BFCache document may miss cross-tab storage events while suspended.
 * Compare both tokens so logout, account replacement, and refresh-token
 * rotation force a clean bootstrap before the old private UI is reused.
 */
export function shouldReloadAfterBfcacheRestore(
  persisted: boolean,
  expected: SessionIdentity,
  stored: SessionIdentity
): boolean {
  if (!persisted) return false;
  return expected?.access_token !== stored?.access_token
    || expected?.refresh_token !== stored?.refresh_token;
}
