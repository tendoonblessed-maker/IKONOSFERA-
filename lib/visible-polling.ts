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

  // A BFCache restore can fire pageshow without a useful visibilitychange.
  // Coalesce the follow-up visibility/online signal so one restore means one
  // authoritative refresh, while a restore that is still offline waits for
  // the real online event.
  // Coalesce visibility/online events that accompany one BFCache restore.
  // A timestamp handles either event order without leaving a stale one-shot flag.
  let pageShowResumeAt = 0;
  const isPageShowFollowup = () => {
    if (!pageShowResumeAt) return false;
    if (Date.now() - pageShowResumeAt > 1000) {
      pageShowResumeAt = 0;
      return false;
    }
    return true;
  };
  const onVisibilityChange = () => {
    if (documentRef.visibilityState === 'visible') {
      if (isPageShowFollowup()) return;
      refreshAndStart();
    } else {
      pageShowResumeAt = 0;
      pause();
    }
  };
  const onOnline = () => {
    if (isPageShowFollowup()) return;
    refreshAndStart();
  };
  const onOffline = () => {
    pageShowResumeAt = 0;
    pause();
  };
  const onPageHide = () => {
    // pagehide may run before a mobile browser freezes the page for BFCache,
    // even when visibilitychange is not delivered. Stop timers and abort reads
    // before the snapshot; a persisted pageshow below performs reconciliation.
    pageShowResumeAt = 0;
    pause();
  };
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    pageShowResumeAt = 0;
    if (!canPoll()) {
      pause();
      return;
    }
    pageShowResumeAt = Date.now();
    refreshAndStart();
  };

  documentRef.addEventListener('visibilitychange', onVisibilityChange);
  windowRef.addEventListener('online', onOnline);
  windowRef.addEventListener('offline', onOffline);
  windowRef.addEventListener('pageshow', onPageShow);
  windowRef.addEventListener('pagehide', onPageHide);
  start();

  return () => {
    disposed = true;
    eligible = false;
    stop();
    documentRef.removeEventListener('visibilitychange', onVisibilityChange);
    windowRef.removeEventListener('online', onOnline);
    windowRef.removeEventListener('offline', onOffline);
    windowRef.removeEventListener('pageshow', onPageShow);
    windowRef.removeEventListener('pagehide', onPageHide);
  };
}
