/**
 * Collect bounded PostgREST range pages without silently stopping at the first
 * server page. Content-Range totals let us continue even when the server's
 * configured max-rows is smaller than the requested range.
 */

/**
 * @param {string|null} contentRange
 * @returns {number|null}
 */
export function parsePostgrestTotal(contentRange) {
  if (typeof contentRange !== 'string') return null;
  const match = /\/\s*(\d+|\*)\s*$/.exec(contentRange.trim());
  if (!match || match[1] === '*') return null;
  const total = Number(match[1]);
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

/**
 * @template T
 * @param {(offset:number, limit:number)=>Promise<{rows:T[], contentRange:string|null}>} fetchPage
 * @param {{pageSize?:number, maxPages?:number}} [options]
 * @returns {Promise<T[]>}
 */
export async function collectPostgrestPages(fetchPage, options = {}) {
  const pageSize = Number.isSafeInteger(options.pageSize) && options.pageSize > 0
    ? options.pageSize
    : 100;
  const maxPages = Number.isSafeInteger(options.maxPages) && options.maxPages > 0
    ? options.maxPages
    : 1000;
  const collected = [];
  let offset = 0;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const page = await fetchPage(offset, pageSize);
    if (!page || !Array.isArray(page.rows)) {
      throw new Error('PostgREST returned an invalid page.');
    }

    const rows = page.rows;
    const total = parsePostgrestTotal(page.contentRange);
    collected.push(...rows);

    if (total !== null && collected.length >= total) return collected;
    if (rows.length === 0) {
      if (total !== null && collected.length < total) {
        throw new Error('PostgREST pagination ended before the reported total.');
      }
      return collected;
    }

    offset += rows.length;
    if (total === null && rows.length < pageSize) return collected;
  }

  throw new Error('PostgREST pagination exceeded the safe page limit.');
}
