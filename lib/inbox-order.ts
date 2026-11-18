/**
 * Sort direct and group inbox rows by their latest activity, newest first.
 *
 * Date.parse() intentionally exposes millisecond precision only. Postgres
 * timestamps can carry microseconds, so compare the remaining three digits
 * when both instants fall in the same millisecond. Invalid timestamps sort
 * after valid ones; conversation ID is a deterministic final tie-breaker.
 */
export type InboxActivity = {
  conversationId: string;
  timestamp: string;
};

function subMillisecondMicros(value: string): number {
  const fraction = /T\d{2}:\d{2}:\d{2}\.(\d+)/i.exec(value)?.[1] ?? '';
  return Number((fraction + '000000').slice(3, 6));
}

export function compareInboxActivityDescending(
  left: InboxActivity,
  right: InboxActivity
): number {
  const leftMillis = Date.parse(left.timestamp);
  const rightMillis = Date.parse(right.timestamp);
  const leftValid = Number.isFinite(leftMillis);
  const rightValid = Number.isFinite(rightMillis);

  if (leftValid && rightValid) {
    if (leftMillis !== rightMillis) return rightMillis - leftMillis;

    const leftMicros = subMillisecondMicros(left.timestamp);
    const rightMicros = subMillisecondMicros(right.timestamp);
    if (leftMicros !== rightMicros) return rightMicros - leftMicros;
  } else if (leftValid !== rightValid) {
    return leftValid ? -1 : 1;
  }

  const leftId = left.conversationId.toLowerCase();
  const rightId = right.conversationId.toLowerCase();
  if (leftId === rightId) return 0;
  return leftId < rightId ? -1 : 1;
}
