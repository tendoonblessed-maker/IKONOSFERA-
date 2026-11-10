/** Truncate an inbox preview without cutting a visible Unicode character.
 * The limit is measured in UTF-16 code units to preserve the existing UI cap.
 * Intl.Segmenter keeps extended grapheme clusters intact where available;
 * the fallback at least preserves complete Unicode code points on older browsers.
 */
type GraphemeSegmenter = {
  segment(value: string): Iterable<{ segment: string }>;
};
type GraphemeSegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: "grapheme" }
) => GraphemeSegmenter;

export const CHAT_PREVIEW_MAX_CODE_UNITS = 110;

export function truncatePreviewText(
  value: string,
  maxCodeUnits = CHAT_PREVIEW_MAX_CODE_UNITS
): string {
  const limit = Number.isFinite(maxCodeUnits)
    ? Math.max(0, Math.floor(maxCodeUnits))
    : CHAT_PREVIEW_MAX_CODE_UNITS;
  if (limit === 0 || value.length === 0) return "";
  if (value.length <= limit) return value;

  const Segmenter = typeof Intl === "undefined"
    ? undefined
    : (Intl as typeof Intl & { Segmenter?: GraphemeSegmenterConstructor }).Segmenter;

  if (typeof Segmenter === "function") {
    try {
      let result = "";
      let length = 0;
      for (const item of new Segmenter(undefined, { granularity: "grapheme" }).segment(value)) {
        if (length + item.segment.length > limit) break;
        result += item.segment;
        length += item.segment.length;
      }
      return result;
    } catch {
      // Fall through for partial/older Intl implementations.
    }
  }

  // String iteration yields Unicode code points, never isolated surrogates.
  let result = "";
  let length = 0;
  for (const point of value) {
    if (length + point.length > limit) break;
    result += point;
    length += point.length;
  }
  return result;
}
