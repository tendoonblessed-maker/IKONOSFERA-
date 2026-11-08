/**
 * Keep a fallback polling timer active only while the document is visible.
 * The caller owns the initial fetch; becoming visible triggers one fresh fetch
 * before periodic polling resumes.
 */
export function startVisiblePolling(
  callback: () => void,
  intervalMs = 6000,
  documentRef: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> = document,
  windowRef: Pick<Window, 'setInterval' | 'clearInterval'> = window
): () => void {
  let timer: number | null = null;
  let disposed = false;

  const stop = () => {
    if (timer === null) return;
    windowRef.clearInterval(timer);
    timer = null;
  };

  const start = () => {
    if (disposed || documentRef.visibilityState !== 'visible' || timer !== null) return;
    timer = windowRef.setInterval(callback, intervalMs);
  };

  const onVisibilityChange = () => {
    if (documentRef.visibilityState === 'visible') {
      callback();
      start();
    } else {
      stop();
    }
  };

  documentRef.addEventListener('visibilitychange', onVisibilityChange);
  start();

  return () => {
    disposed = true;
    stop();
    documentRef.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
