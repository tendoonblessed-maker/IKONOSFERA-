/**
 * PostgREST keyset pagination for owner-scoped contact lists.
 * Every request is constrained by the last (created_at, id) tuple rather than
 * an offset. Exact Content-Range totals prevent a server max-rows cap from
 * being mistaken for the final page.
 */
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const ID_COLUMNS = new Set(['contact_id', 'blocked_id']);

/** Compare two rows in the exact PostgREST order: created_at DESC, id ASC.
 * Date.parse keeps only milliseconds, so restore the remaining PostgreSQL
 * microseconds before comparing timestamps. */
function timestampMicros(value) {
  const milliseconds = Date.parse(value);
  const fraction = /\\.(\\d{1,6})/.exec(value)?.[1] ?? '';
  const remainder = fraction.padEnd(6, '0').slice(3).padEnd(3, '0');
  return BigInt(milliseconds) * 1000n + BigInt(remainder || '0');
}

function comparePostgrestOrder(left, right) {
  const leftTime = timestampMicros(left.created_at);
  const rightTime = timestampMicros(right.created_at);
  if (leftTime !== rightTime) return leftTime > rightTime ? -1 : 1;
  const leftId = left.id.toLowerCase();
  const rightId = right.id.toLowerCase();
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

export function parsePostgrestContentRange(contentRange) {
  if (contentRange == null) return null;
  if (typeof contentRange !== 'string') throw new Error('PostgREST returned an invalid Content-Range header.');
  const match = /^\s*(?:(\d+)-(\d+)|\*)\s*\/\s*(\d+|\*)\s*$/.exec(contentRange);
  if (!match) throw new Error('PostgREST returned an invalid Content-Range header.');
  const total = match[3] === '*' ? null : Number(match[3]);
  if (total !== null && (!Number.isSafeInteger(total) || total < 0)) throw new Error('PostgREST returned an invalid Content-Range total.');
  if (match[1] === undefined) return {start: null, end: null, total};
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) throw new Error('PostgREST returned an invalid Content-Range interval.');
  if (total !== null && end >= total) throw new Error('PostgREST Content-Range exceeds its reported total.');
  return {start, end, total};
}

export function buildPostgrestCursorFilter(cursor, idColumn) {
  if (!ID_COLUMNS.has(idColumn)) throw new Error('PostgREST cursor uses an unsupported ID column.');
  if (cursor == null) return null;
  if (
    typeof cursor.created_at !== 'string'
    || !TIMESTAMP.test(cursor.created_at)
    || !Number.isFinite(Date.parse(cursor.created_at))
    || typeof cursor.id !== 'string'
    || !UUID.test(cursor.id)
  ) throw new Error('PostgREST pagination cursor is invalid.');
  return '(created_at.lt.' + cursor.created_at
    + ',and(created_at.eq.' + cursor.created_at
    + ',' + idColumn + '.gt.' + cursor.id + '))';
}

/**
 * @template T
 * @param {(cursor:{created_at:string,id:string}|null,limit:number)=>Promise<{rows:T[],contentRange:string|null}>} fetchPage
 * @param {(row:T)=>{created_at:string,id:string}} getCursor
 * @param {{pageSize?:number,maxPages?:number}} [options]
 * @returns {Promise<T[]>}
 */
export async function collectPostgrestKeysetPages(fetchPage, getCursor, options = {}) {
  const pageSize = Number.isSafeInteger(options.pageSize) && options.pageSize > 0 ? options.pageSize : 100;
  const maxPages = Number.isSafeInteger(options.maxPages) && options.maxPages > 0 ? options.maxPages : 1000;
  const collected = [];
  const seenIds = new Set();
  let cursor = null;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const page = await fetchPage(cursor, pageSize);
    if (!page || !Array.isArray(page.rows) || page.rows.length > pageSize) throw new Error('PostgREST returned an invalid page.');
    const rows = page.rows;
    const range = parsePostgrestContentRange(page.contentRange);
    if (!range) throw new Error('PostgREST omitted Content-Range; refusing a partial list.');
    if (range.start === null) {
      if (rows.length === 0 && range.total === 0) return collected;
      if (rows.length === 0 && range.total !== null && range.total > 0) {
        throw new Error('PostgREST pagination stopped before the remaining rows.');
      }
      throw new Error('PostgREST returned an incomplete or inconsistent keyset page.');
    }
    if (range.start !== 0) throw new Error('PostgREST keyset page did not start at the first remaining row.');
    if (range.end - range.start + 1 !== rows.length) throw new Error('PostgREST Content-Range does not match the page length.');
    if (range.total === null) throw new Error('PostgREST omitted an exact total; refusing a partial list.');
    if (range.total < rows.length) throw new Error('PostgREST total is smaller than the returned page.');
    if (rows.length === 0) {
      if (range.total === 0) return collected;
      throw new Error('PostgREST pagination stopped before the remaining rows.');
    }

    let previousCursor = cursor;
    for (const row of rows) {
      const value = getCursor(row);
      if (
        !value
        || typeof value.created_at !== 'string'
        || !TIMESTAMP.test(value.created_at)
        || !Number.isFinite(Date.parse(value.created_at))
        || typeof value.id !== 'string'
        || !UUID.test(value.id)
      ) throw new Error('PostgREST returned a row with an invalid pagination cursor.');
      const id = value.id.toLowerCase();
      if (seenIds.has(id)) throw new Error('PostgREST repeated a row during keyset pagination.');
      if (previousCursor && comparePostgrestOrder(previousCursor, value) >= 0) {
        throw new Error('PostgREST returned rows outside the requested keyset order.');
      }
      seenIds.add(id);
      previousCursor = value;
    }

    collected.push(...rows);
    if (rows.length === range.total) return collected;
    cursor = getCursor(rows[rows.length - 1]);
  }
  throw new Error('PostgREST pagination exceeded the safe page limit.');
}
