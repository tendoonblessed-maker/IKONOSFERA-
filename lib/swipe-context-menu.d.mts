export const TOUCH_CONTEXT_MENU_SUPPRESSION_MS: number;
export function shouldSuppressDuplicateContextMenu(lastTouchMenuAt: number | null, now: number): boolean;
export function shouldCancelTouchGesture(visibilityState: string, windowHasFocus: boolean): boolean;
