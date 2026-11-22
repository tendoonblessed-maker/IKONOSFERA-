/**
 * Browsers may dispatch a native contextmenu event shortly after a touch
 * long-press timer has already opened the app's message action menu.
 * Suppress only that near-immediate duplicate; later context menus remain usable.
 */
export const TOUCH_CONTEXT_MENU_SUPPRESSION_MS = 900;

export function shouldSuppressDuplicateContextMenu(
  lastTouchMenuAt: number | null,
  now: number
): boolean {
  if (lastTouchMenuAt === null || !Number.isFinite(lastTouchMenuAt) || !Number.isFinite(now)) {
    return false;
  }
  const elapsed = now - lastTouchMenuAt;
  return elapsed >= 0 && elapsed <= TOUCH_CONTEXT_MENU_SUPPRESSION_MS;
}
