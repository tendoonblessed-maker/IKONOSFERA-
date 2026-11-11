/** Truncate or slice a preview without splitting visible grapheme clusters where supported.
 * Limits are measured in UTF-16 code units to preserve existing UI caps.
 * Intl.Segmenter keeps extended grapheme clusters intact; the fallback keeps
 * complete Unicode code points on older browsers.
 */
type GraphemeSegment = {
  segment: string;
  index: number;
};
type GraphemeSegmenter = {
  segment(value: string): Iterable<GraphemeSegment>;
};
type GraphemeSegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: "grapheme" }
) => GraphemeSegmenter;

export const CHAT_PREVIEW_MAX_CODE_UNITS = 110;

export function slicePreviewText(
  value: string,
  startCodeUnit: number,
  maxCodeUnits = CHAT_PREVIEW_MAX_CODE_UNITS
): string {
  const start = Number.isFinite(startCodeUnit)
    ? Math.max(0, Math.floor(startCodeUnit))
    : 0;
  const limit = Number.isFinite(maxCodeUnits)
    ? Math.max(0, Math.floor(maxCodeUnits))
    : CHAT_PREVIEW_MAX_CODE_UNITS;
  if (limit === 0 || value.length === 0 || start >= value.length) return "";

  const Segmenter = typeof Intl === "undefined"
    ? undefined
    : (Intl as typeof Intl & { Segmenter?: GraphemeSegmenterConstructor }).Segmenter;

  if (typeof Segmenter === "function") {
    try {
      let result = "";
      let length = 0;
      let started = false;
      for (const item of new Segmenter(undefined, { granularity: "grapheme" }).segment(value)) {
        const segmentStart = item.index;
        const segmentEnd = segmentStart + item.segment.length;
        if (!started) {
          // If the requested offset falls inside a grapheme, skip that
          // grapheme rather than exposing a detached combining mark or ZWJ.
          if (segmentEnd <= start || segmentStart < start) continue;
          started = true;
        }
        if (length + item.segment.length > limit) break;
        result += item.segment;
        length += item.segment.length;
      }
      return result;
    } catch {
      // Fall through for partial/older Intl implementations.
    }
  }

  let result = "";
  let length = 0;
  let offset = 0;
  let started = false;
  for (const point of value) {
    const pointStart = offset;
    offset += point.length;
    if (!started) {
      if (pointStart < start) continue;
      started = true;
    }
    if (length + point.length > limit) break;
    result += point;
    length += point.length;
  }
  return result;
}

export function truncatePreviewText(
  value: string,
  maxCodeUnits = CHAT_PREVIEW_MAX_CODE_UNITS
): string {
  return slicePreviewText(value, 0, maxCodeUnits);
}
