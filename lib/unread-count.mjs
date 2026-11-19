/** Normalize untrusted inbox unread-count values and provide a shared badge contract.
 * @param {unknown} value
 * @returns {{count:number, visible:string, ariaLabel:string}|null}
 */
export function formatUnreadBadge(value) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const count = Math.floor(numeric);
  if (!Number.isSafeInteger(count) || count <= 0) return null;
  return {
    count,
    visible: count > 99 ? '99+' : String(count),
    ariaLabel: 'Непрочитанных: ' + count,
  };
}
