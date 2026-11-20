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
const LETTER_RE = (() => {
  try { return new RegExp('\\p{Letter}', 'u'); }
  catch { return null; }
})();

const VIRAMA_CODES = new Set([
  0x094d, 0x09cd, 0x0a4d, 0x0acd, 0x0b4d, 0x0bcd, 0x0c4d, 0x0ccd, 0x0d4d, 0x0dca,
  0x1039, 0x17d2, 0x1a60, 0x1b44, 0x1baa, 0x11046, 0x110b9, 0x11133, 0x111c0,
  0x11235, 0x112ea, 0x1134d, 0x11442, 0x114c2, 0x115bf, 0x1163f, 0x116b6, 0x1172b,
  0x11839, 0x1193d, 0x11a34, 0x11a47, 0x11c3f, 0x11d44, 0x11d97, 0x11f41
]);
const INDIC_LETTER_RANGES = [
  [0x0915, 0x0939], [0x0958, 0x095f], [0x0978, 0x097f],
  [0x0995, 0x09b9], [0x09dc, 0x09df], [0x09f0, 0x09f1],
  [0x0a15, 0x0a39], [0x0a59, 0x0a5e],
  [0x0a95, 0x0ab9], [0x0ae0, 0x0ae1],
  [0x0b15, 0x0b39], [0x0b5c, 0x0b5d], [0x0b5f, 0x0b5f],
  [0x0b95, 0x0bb9], [0x0c15, 0x0c39], [0x0c58, 0x0c5a],
  [0x0c95, 0x0cb9], [0x0cdc, 0x0cde],
  [0x0d15, 0x0d3a], [0x0d54, 0x0d56], [0x0d9a, 0x0dc6],
  [0x1000, 0x102a], [0x1780, 0x17a2],
  [0x11013, 0x11037], [0x11083, 0x110af], [0x11103, 0x11126],
  [0x11183, 0x111b2], [0x11200, 0x1122b], [0x112b0, 0x112de],
  [0x11315, 0x11339], [0x1140e, 0x11434], [0x11480, 0x114af],
  [0x11580, 0x115ae], [0x11600, 0x1162f], [0x11680, 0x116aa],
  [0x11700, 0x1171a], [0x11800, 0x1182b], [0x11900, 0x1192f],
  [0x11a00, 0x11a32], [0x11a50, 0x11a83], [0x11c00, 0x11c2e],
  [0x11d00, 0x11d30], [0x11d60, 0x11d89], [0x11f00, 0x11f29]
];

function isIndicConsonant(code, character) {
  if (!INDIC_LETTER_RANGES.some(([start, end]) => code >= start && code <= end)) return false;
  return LETTER_RE ? LETTER_RE.test(character) : !isExtend(code, character);
}

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
  let joinIndicNext = false;
  let previousCode = -1;

  for (const character of text) {
    const code = character.codePointAt(0);
    const length = character.length;
    const regional = code >= 0x1f1e6 && code <= 0x1f1ff;
    const extend = isExtend(code, character);
    const attach = clusterEnd > clusterStart &&
      (extend || code === 0x200d || joinNext ||
        (joinIndicNext && isIndicConsonant(code, character)) ||
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
    joinIndicNext = VIRAMA_CODES.has(code) || (extend && joinIndicNext);
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
