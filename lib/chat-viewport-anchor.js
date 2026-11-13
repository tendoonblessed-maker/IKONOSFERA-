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
