/**
 * Capture the last caret/selection without changing focus. Browsers retain
 * textarea selection after blur, which lets an explicit reply action restore
 * the user's editing position without stealing focus after navigation.
 */
export function captureComposerSelection(element) {
  if (!element) return null;
  const start = Number(element.selectionStart);
  const end = Number(element.selectionEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;

  const direction = element.selectionDirection === 'forward'
    || element.selectionDirection === 'backward'
    ? element.selectionDirection
    : 'none';
  return { start, end, direction };
}

/**
 * Focus a composer only while its original chat/account context is still
 * current. Never calls focus itself when the element has been detached or the
 * caller's context guard has expired.
 */
export function focusComposerIfCurrent(element, selection, isCurrent) {
  if (!element || element.isConnected === false
      || typeof isCurrent !== 'function' || !isCurrent()
      || typeof element.focus !== 'function') return false;

  try {
    element.focus({ preventScroll: true });
  } catch {
    // Older Safari implementations may not accept FocusOptions.
    element.focus();
  }

  if (selection && typeof element.setSelectionRange === 'function') {
    const length = typeof element.value === 'string' ? element.value.length : 0;
    const start = Math.max(0, Math.min(length, selection.start));
    const end = Math.max(start, Math.min(length, selection.end));
    const direction = selection.direction === 'forward'
      || selection.direction === 'backward'
      ? selection.direction
      : 'none';
    element.setSelectionRange(start, end, direction);
  }
  return true;
}
