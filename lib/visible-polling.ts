/**
 * Keep a fallback polling timer active only while the document is visible
 * and the browser reports a network connection. Becoming visible or online
 * triggers one fresh fetch before periodic polling resumes.
 *
 * onPause invalidates work started during the previous visible/online period;
 * callers can use a generation counter to ignore responses that finish later.
 */
export function startVisiblePolling(
  callback: () => void,
  intervalMs = 6000,
  documentRef: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> = document,
  windowRef: Pick<Window, 'setInterval' | 'clearInterval' | 'addEventListener' | 'removeEventListener'> = window,
  navigatorRef: Pick<Navigator, 'onLine'> = navigator,
  onResume: () => void = callback,
  onPause: () => void = () => {}
): () => void {
  let timer: number | null = null;
  let disposed = false;
  let eligible = documentRef.visibilityState === 'visible' && navigatorRef.onLine;

  const canPoll = () => !disposed
    && documentRef.visibilityState === 'visible'
    && navigatorRef.onLine;

  const stop = () => {
    if (timer === null) return;
    windowRef.clearInterval(timer);
    timer = null;
  };

  const start = () => {
    if (!canPoll() || timer !== null) return;
    timer = windowRef.setInterval(callback, intervalMs);
  };

  const pause = () => {
    const wasEligible = eligible;
    eligible = false;
    stop();
    if (wasEligible) onPause();
  };

  const refreshAndStart = () => {
    if (!canPoll()) {
      pause();
      return;
    }
    eligible = true;
    onResume();
    start();
  };

  const onVisibilityChange = () => {
    if (documentRef.visibilityState === 'visible') refreshAndStart();
    else pause();
  };
  const onOnline = () => refreshAndStart();
  const onOffline = () => pause();

  documentRef.addEventListener('visibilitychange', onVisibilityChange);
  windowRef.addEventListener('online', onOnline);
  windowRef.addEventListener('offline', onOffline);
  start();

  return () => {
    disposed = true;
    eligible = false;
    stop();
    documentRef.removeEventListener('visibilitychange', onVisibilityChange);
    windowRef.removeEventListener('online', onOnline);
    windowRef.removeEventListener('offline', onOffline);
  };
}
