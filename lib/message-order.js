/**
 * Compare PostgreSQL timestamptz values without losing their microseconds.
 * Date.parse() keeps only milliseconds; PostgREST order/cursors retain up to
 * six fractional digits, so client-side merges must use the same precision.
 * @param {string} value
 * @returns {number}
 */
function microsecondFraction(value) {
  const fraction = /\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? '';
  return Number(fraction.padEnd(6, '0'));
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareMessageTimestamps(a, b) {
  const aMilliseconds = Date.parse(a);
  const bMilliseconds = Date.parse(b);
  if (!Number.isFinite(aMilliseconds) || !Number.isFinite(bMilliseconds)) return 0;
  const milliseconds = aMilliseconds - bMilliseconds;
  if (milliseconds !== 0) return milliseconds;
  return microsecondFraction(a) - microsecondFraction(b);
}
