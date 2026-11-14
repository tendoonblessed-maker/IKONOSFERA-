export function captureChatViewportAnchor(history, threshold = 120) {
  if (!history) return null;

  const scrollTop = Number(history.scrollTop);
  const scrollHeight = Number(history.scrollHeight);
  const clientHeight = Number(history.clientHeight);
  if (![scrollTop, scrollHeight, clientHeight].every(Number.isFinite)) return null;

  const safeThreshold = Number.isFinite(threshold) && threshold >= 0 ? threshold : 120;
  return {
    scrollTop,
    followBottom: scrollHeight - scrollTop - clientHeight <= safeThreshold,
  };
}

export function restoreChatViewportAnchor(history, anchor) {
  if (!history || !anchor || !Number.isFinite(anchor.scrollTop)) return false;

  const scrollHeight = Number(history.scrollHeight);
  const clientHeight = Number(history.clientHeight);
  if (![scrollHeight, clientHeight].every(Number.isFinite)) return false;

  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  history.scrollTop = anchor.followBottom
    ? maxScrollTop
    : Math.min(maxScrollTop, Math.max(0, anchor.scrollTop));
  return true;
}


const SCROLL_INTENT_KEYS = new Set([
  'ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '
]);

/**
 * Notify when a person explicitly interacts with the history while a viewport
 * anchor is pending. The caller can then abandon the stale restoration rather
 * than pulling the reader back after a touch, wheel, pointer or scroll key.
 */
export function watchChatViewportIntent(history, onIntent) {
  if (!history || typeof history.addEventListener !== 'function'
      || typeof onIntent !== 'function') return () => {};

  let active = true;
  const notify = event => {
    if (event.type === 'keydown' && !SCROLL_INTENT_KEYS.has(event.key)) return;
    // A pointerdown on a nested message control is a click, not evidence that
    // the reader is moving the history. Touch drags are covered by touchmove;
    // scrollbar/background presses still target the history container.
    if (event.type === 'pointerdown' && event.target !== history) return;
    onIntent(event.type);
  };
  const passive = {passive:true};
  history.addEventListener('wheel', notify, passive);
  history.addEventListener('touchmove', notify, passive);
  history.addEventListener('pointerdown', notify, passive);
  history.addEventListener('keydown', notify);

  return () => {
    if (!active) return;
    active = false;
    history.removeEventListener('wheel', notify);
    history.removeEventListener('touchmove', notify);
    history.removeEventListener('pointerdown', notify);
    history.removeEventListener('keydown', notify);
  };
}
