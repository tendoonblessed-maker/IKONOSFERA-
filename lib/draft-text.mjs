/**
 * Truncate draft text within a UTF-16 storage limit without splitting a
 * grapheme cluster. Prefer Intl.Segmenter; use a conservative portable
 * fallback for older mobile WebViews.
 * @param {string} text
 * @param {number} [maxLength]
 * @returns {string}
 */
const MARK_RE = (() => {
  try { return new RegExp('\\p{Mark}', 'u'); }
  catch { return null; }
})();

function isExtend(code, character) {
  if (MARK_RE && MARK_RE.test(character)) return true;
  return (code >= 0x0300 && code <= 0x036f) ||
    (code >= 0x1ab0 && code <= 0x1aff) ||
    (code >= 0x1dc0 && code <= 0x1dff) ||
    (code >= 0x20d0 && code <= 0x20ff) ||
    (code >= 0xfe20 && code <= 0xfe2f) ||
    (code >= 0xfe00 && code <= 0xfe0f) ||
    (code >= 0xe0100 && code <= 0xe01ef) ||
    (code >= 0x1f3fb && code <= 0x1f3ff) ||
    (code >= 0xe0020 && code <= 0xe007f);
}

function truncateFallback(text, maxLength) {
  let clusterStart = 0;
  let clusterEnd = 0;
  let safeEnd = 0;
  let regionalCount = 0;
  let joinNext = false;

  for (const character of text) {
    const code = character.codePointAt(0);
    const length = character.length;
    const regional = code >= 0x1f1e6 && code <= 0x1f1ff;
    const extend = isExtend(code, character);
    const attach = clusterEnd > clusterStart &&
      (extend || code === 0x200d || joinNext || (regional && regionalCount % 2 === 1));

    if (!attach) {
      if (clusterEnd <= maxLength) safeEnd = clusterEnd;
      clusterStart = clusterEnd;
      regionalCount = 0;
    }

    clusterEnd += length;
    if (regional) regionalCount += 1;
    else if (!extend && code !== 0x200d) regionalCount = 0;
    joinNext = code === 0x200d;

    if (clusterEnd > maxLength) return safeEnd;
  }

  return clusterEnd <= maxLength ? clusterEnd : safeEnd;
}

export function truncateDraftText(text, maxLength = 4000) {
  if (!Number.isSafeInteger(maxLength) || maxLength < 0) return '';
  if (text.length <= maxLength) return text;

  try {
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      let end = 0;
      for (const item of segmenter.segment(text)) {
        const nextEnd = item.index + item.segment.length;
        if (nextEnd > maxLength) break;
        end = nextEnd;
      }
      return text.slice(0, end);
    }
  } catch {
    // Fall through to the code-point-aware fallback for older/partial runtimes.
  }

  return text.slice(0, truncateFallback(text, maxLength));
}
