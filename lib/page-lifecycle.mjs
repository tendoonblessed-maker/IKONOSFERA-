/**
 * Return true only when a page was restored from the back/forward cache
 * while visible and the browser reports a network connection.
 *
 * pageshow also fires on ordinary navigation; those initial loads already
 * have their own data bootstrap and must not trigger a duplicate refresh.
 */
export function shouldRefreshAfterPageShow(event, visibilityState, online) {
  return event?.persisted === true
    && visibilityState === 'visible'
    && online === true;
}
