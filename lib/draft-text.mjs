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

function hangulType(code) {
  if ((code >= 0x1100 && code <= 0x115f) ||
      (code >= 0xa960 && code <= 0xa97c)) return 'L';
  if ((code >= 0x1160 && code <= 0x11a7) ||
      (code >= 0xd7b0 && code <= 0xd7c6)) return 'V';
  if ((code >= 0x11a8 && code <= 0x11ff) ||
      (code >= 0xd7cb && code <= 0xd7fb)) return 'T';
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 === 0 ? 'LV' : 'LVT';
  }
  return '';
}

function joinsHangul(previous, current) {
  const prev = hangulType(previous);
  const next = hangulType(current);
  return (prev === 'L' && ['L', 'V', 'LV', 'LVT'].includes(next)) ||
    (['LV', 'V'].includes(prev) && ['V', 'T'].includes(next)) ||
    (['LVT', 'T'].includes(prev) && next === 'T');
}

function truncateFallback(text, maxLength) {
  let clusterStart = 0;
  let clusterEnd = 0;
  let safeEnd = 0;
  let regionalCount = 0;
  let joinNext = false;
  let previousCode = -1;

  for (const character of text) {
    const code = character.codePointAt(0);
    const length = character.length;
    const regional = code >= 0x1f1e6 && code <= 0x1f1ff;
    const extend = isExtend(code, character);
    const attach = clusterEnd > clusterStart &&
      (extend || code === 0x200d || joinNext ||
        (regional && regionalCount % 2 === 1) ||
        (previousCode === 0x000d && code === 0x000a) ||
        joinsHangul(previousCode, code));

    if (!attach) {
      if (clusterEnd <= maxLength) safeEnd = clusterEnd;
      clusterStart = clusterEnd;
      regionalCount = 0;
    }

    clusterEnd += length;
    if (regional) regionalCount += 1;
    else if (!extend && code !== 0x200d) regionalCount = 0;
    joinNext = code === 0x200d || (extend && joinNext);
    previousCode = code;

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
