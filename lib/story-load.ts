/**
 * Run a story-list request without allowing stale failures or responses to
 * overwrite the current account's UI. Network errors are represented in UI
 * state rather than being silently swallowed by the caller.
 */
export async function runScopedStoryLoad<T>(
  request: () => Promise<T>,
  isCurrent: () => boolean,
  onSuccess: (value: T) => void,
  onFailure: () => void
): Promise<T | null> {
  try {
    const value = await request();
    if (!isCurrent()) return null;
    onSuccess(value);
    return value;
  } catch {
    if (isCurrent()) onFailure();
    return null;
  }
}
