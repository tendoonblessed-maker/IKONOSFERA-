export function captureChatViewportAnchor(history, threshold = 120) {
  if (!history) return null;

  const scrollTop = Number(history.scrollTop);
  const scrollHeight = Number(history.scrollHeight);
  const clientHeight = Number(history.clientHeight);
  if (![scrollTop, scrollHeight, clientHeight].every(Number.isFinite)) return null;

  const safeThreshold = Number.isFinite(threshold) && threshold >= 0 ? threshold : 120;
  const anchor = {
    scrollTop,
    followBottom: scrollHeight - scrollTop - clientHeight <= safeThreshold,
  };

  // Prefer stable message elements over an absolute scrollTop. Text wrapping,
  // font scaling, history prepends and edits can move the same message while
  // leaving scrollTop unchanged. Keep a few visible candidates so a concurrent
  // deletion of the first message does not force an unrelated absolute fallback.
  if (!anchor.followBottom
      && typeof history.getBoundingClientRect === 'function'
      && typeof history.querySelectorAll === 'function') {
    const historyRect = history.getBoundingClientRect();
    if (historyRect
        && Number.isFinite(historyRect.top)
        && Number.isFinite(historyRect.bottom)) {
      const messages = history.querySelectorAll('[id^="ik-chat-message-"]');
      const messageAnchors = [];
      for (const message of messages) {
        if (!message || typeof message.id !== 'string'
            || !message.id.startsWith('ik-chat-message-')
            || typeof message.getBoundingClientRect !== 'function') continue;
        const rect = message.getBoundingClientRect();
        if (!rect || !Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) continue;
        if (rect.bottom <= historyRect.top || rect.top >= historyRect.bottom) continue;

        messageAnchors.push({
          id: message.id,
          offset: rect.top - historyRect.top,
        });
        if (messageAnchors.length >= 4) break;
      }

      if (messageAnchors.length) anchor.messageAnchors = messageAnchors;
    }
  }

  return anchor;
}

export function restoreChatViewportAnchor(history, anchor) {
  if (!history || !anchor || !Number.isFinite(anchor.scrollTop)) return false;

  const scrollHeight = Number(history.scrollHeight);
  const clientHeight = Number(history.clientHeight);
  if (![scrollHeight, clientHeight].every(Number.isFinite)) return false;

  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  if (!anchor.followBottom
      && typeof history.getBoundingClientRect === 'function'
      && typeof history.querySelectorAll === 'function') {
    const historyRect = history.getBoundingClientRect();
    const messages = history.querySelectorAll('[id^="ik-chat-message-"]');
    const candidates = Array.isArray(anchor.messageAnchors)
      ? anchor.messageAnchors
      : (typeof anchor.messageId === 'string'
        ? [{id: anchor.messageId, offset: anchor.messageOffset}]
        : []);
    const currentScrollTop = Number(history.scrollTop);

    if (historyRect
        && Number.isFinite(historyRect.top)
        && Number.isFinite(currentScrollTop)) {
      const byId = new Map(Array.from(messages)
        .filter(item => typeof item?.id === 'string')
        .map(item => [item.id, item]));

      // If Realtime deletes the primary anchor while a viewport resize is
      // pending, use the next still-rendered visible message before falling
      // back to an absolute scrollTop.
      for (const candidate of candidates) {
        if (typeof candidate?.id !== 'string'
            || !candidate.id.startsWith('ik-chat-message-')
            || !Number.isFinite(candidate.offset)) continue;
        const message = byId.get(candidate.id);
        const rect = message?.getBoundingClientRect?.();
        if (!rect || !Number.isFinite(rect.top)) continue;

        const currentOffset = rect.top - historyRect.top;
        const delta = currentOffset - candidate.offset;
        if (Number.isFinite(delta)) {
          history.scrollTop = Math.min(maxScrollTop, Math.max(0, currentScrollTop + delta));
          return true;
        }
      }
    }
  }

  // If every captured message was removed/unmounted, retain the previous
  // bounded scrollTop behavior rather than failing the viewport update.
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
