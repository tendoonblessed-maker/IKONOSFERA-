/**
 * Collect bounded PostgREST range pages without silently stopping at the first
 * server page. Content-Range totals let us continue even when the server's
 * configured max-rows is smaller than the requested range.
 */

/**
 * Parse the range actually returned by PostgREST. A non-empty page must carry
 * a contiguous item range; otherwise counting rows alone could mistake a
 * repeated first page for progress and silently omit later contacts.
 *
 * @param {string|null} contentRange
 * @returns {{start:number|null,end:number|null,total:number|null}|null}
 */
export function parsePostgrestContentRange(contentRange) {
  if (contentRange == null) return null;
  if (typeof contentRange !== 'string') {
    throw new Error('PostgREST returned an invalid Content-Range header.');
  }

  const match = /^\s*(?:(\d+)-(\d+)|\*)\s*\/\s*(\d+|\*)\s*$/.exec(contentRange);
  if (!match) {
    throw new Error('PostgREST returned an invalid Content-Range header.');
  }

  const total = match[3] === '*' ? null : Number(match[3]);
  if (total !== null && (!Number.isSafeInteger(total) || total < 0)) {
    throw new Error('PostgREST returned an invalid Content-Range total.');
  }

  if (match[1] === undefined) {
    return {start: null, end: null, total};
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) {
    throw new Error('PostgREST returned an invalid Content-Range interval.');
  }
  if (total !== null && end >= total) {
    throw new Error('PostgREST Content-Range exceeds its reported total.');
  }

  return {start, end, total};
}

/**
 * @param {string|null} contentRange
 * @returns {number|null}
 */
export function parsePostgrestTotal(contentRange) {
  return parsePostgrestContentRange(contentRange)?.total ?? null;
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
    const range = parsePostgrestContentRange(page.contentRange);
    const total = range?.total ?? null;

    if (range?.start === null) {
      if (rows.length !== 0) {
        throw new Error('PostgREST returned rows without an item range.');
      }
      if (total !== null && collected.length < total) {
        throw new Error('PostgREST pagination ended before the reported total.');
      }
      if (total !== null && collected.length > total) {
        throw new Error('PostgREST total changed during pagination.');
      }
      return collected;
    }

    if (range) {
      if (range.start !== offset) {
        throw new Error('PostgREST page started at an unexpected offset.');
      }
      if (range.end - range.start + 1 !== rows.length) {
        throw new Error('PostgREST Content-Range does not match the page length.');
      }
    }

    collected.push(...rows);

    if (total !== null) {
      if (collected.length === total) return collected;
      if (collected.length > total) {
        throw new Error('PostgREST total changed during pagination.');
      }
    }
    if (rows.length === 0) return collected;

    offset = range ? range.end + 1 : offset + rows.length;
    if (total === null && rows.length < pageSize) return collected;
  }

  throw new Error('PostgREST pagination exceeded the safe page limit.');
}
