/**
 * Truncate draft text by UTF-16 code units without cutting a valid surrogate pair.
 * Storage limits remain unchanged; this only avoids corrupting a supplementary
 * Unicode character at the truncation boundary.
 * @param {string} text
 * @param {number} [maxLength]
 * @returns {string}
 */
export function truncateDraftText(text, maxLength = 4000) {
  if (!Number.isSafeInteger(maxLength) || maxLength < 0) return '';
  if (text.length <= maxLength) return text;
  let end = maxLength;
  const previous = text.charCodeAt(end - 1);
  const next = text.charCodeAt(end);
  if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
    end -= 1;
  }
  return text.slice(0, end);
}
