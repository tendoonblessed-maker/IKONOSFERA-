/** Truncate an inbox preview without splitting grapheme clusters where supported.
 * The limit is measured in UTF-16 code units to preserve the existing UI cap.
 * Intl.Segmenter provides full extended-grapheme segmentation where available;
 * the fallback keeps common combining, flag, modifier, ZWJ and Hangul sequences intact.
 */
type GraphemeSegment = { segment: string; index: number };
type GraphemeSegmenter = {
  segment(value: string): Iterable<GraphemeSegment>;
};
type GraphemeSegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: "grapheme" }
) => GraphemeSegmenter;

const UNICODE_MARK_PATTERN = (() => {
  try {
    return new RegExp("\\p{M}", "u");
  } catch {
    return null;
  }
})();

const FALLBACK_MARK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0300, 0x036f], [0x0483, 0x0489], [0x0591, 0x05bd], [0x05bf, 0x05bf],
  [0x05c1, 0x05c2], [0x05c4, 0x05c5], [0x0610, 0x061a], [0x064b, 0x065f],
  [0x0670, 0x0670], [0x06d6, 0x06ed], [0x0711, 0x0711], [0x0730, 0x074a],
  [0x07a6, 0x07b0], [0x07eb, 0x07f3], [0x0816, 0x082d], [0x0859, 0x085b],
  [0x08d3, 0x0903], [0x093a, 0x094f], [0x0951, 0x0957], [0x0962, 0x0963],
  [0x1ab0, 0x1aff], [0x1dc0, 0x1dff], [0x20d0, 0x20ff], [0xfe20, 0xfe2f]
];

export const CHAT_PREVIEW_MAX_CODE_UNITS = 110;

function isFallbackExtend(point: string, codePoint: number): boolean {
  return codePoint === 0x200c ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef) ||
    (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) ||
    (codePoint >= 0xe0020 && codePoint <= 0xe007f) ||
    (UNICODE_MARK_PATTERN
      ? UNICODE_MARK_PATTERN.test(point)
      : FALLBACK_MARK_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end));
}

function isControl(codePoint: number): boolean {
  return (codePoint >= 0x0000 && codePoint <= 0x001f) ||
    (codePoint >= 0x007f && codePoint <= 0x009f) ||
    codePoint === 0x2028 || codePoint === 0x2029;
}

function isRegionalIndicator(codePoint: number): boolean {
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

type HangulType = "L" | "V" | "T" | "LV" | "LVT";

function hangulType(codePoint: number): HangulType | null {
  if ((codePoint >= 0x1100 && codePoint <= 0x115f) ||
      (codePoint >= 0xa960 && codePoint <= 0xa97c)) return "L";
  if ((codePoint >= 0x1160 && codePoint <= 0x11a7) ||
      (codePoint >= 0xd7b0 && codePoint <= 0xd7c6)) return "V";
  if ((codePoint >= 0x11a8 && codePoint <= 0x11ff) ||
      (codePoint >= 0xd7cb && codePoint <= 0xd7fb)) return "T";
  if (codePoint >= 0xac00 && codePoint <= 0xd7a3) {
    return (codePoint - 0xac00) % 28 === 0 ? "LV" : "LVT";
  }
  return null;
}

function hangulCanJoin(previous: number, current: number): boolean {
  const before = hangulType(previous);
  const after = hangulType(current);
  return (before === "L" && (after === "L" || after === "V" || after === "LV" || after === "LVT")) ||
    ((before === "LV" || before === "V") && (after === "V" || after === "T")) ||
    ((before === "LVT" || before === "T") && after === "T");
}

/** Best-effort fallback for browsers without Intl.Segmenter. */
function fallbackGraphemeSegments(value: string): string[] {
  const segments: string[] = [];
  let previousCodePoint: number | null = null;
  let regionalIndicatorRun = 0;
  let joinNext = false;

  for (const point of value) {
    const codePoint = point.codePointAt(0)!;
    const previousIsControl = previousCodePoint !== null && isControl(previousCodePoint);
    const currentIsControl = isControl(codePoint);
    const joinsCrLf = previousCodePoint === 0x000d && codePoint === 0x000a;
    const joinsRegionalIndicators = isRegionalIndicator(codePoint) && regionalIndicatorRun % 2 === 1;
    const joinsHangul = previousCodePoint !== null && hangulCanJoin(previousCodePoint, codePoint);
    const shouldJoin = segments.length > 0 && (joinsCrLf ||
      (!previousIsControl && !currentIsControl && (
        isFallbackExtend(point, codePoint) ||
        codePoint === 0x200d ||
        joinNext ||
        joinsRegionalIndicators ||
        joinsHangul
      )));

    if (shouldJoin) segments[segments.length - 1] += point;
    else segments.push(point);

    if (codePoint === 0x200d) joinNext = true;
    else if (joinNext) joinNext = false;

    if (isRegionalIndicator(codePoint)) regionalIndicatorRun += 1;
    else if (!isFallbackExtend(point, codePoint)) regionalIndicatorRun = 0;

    previousCodePoint = codePoint;
  }

  return segments;
}

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
  for (const segment of fallbackGraphemeSegments(value)) {
    const segmentStart = offset;
    const segmentEnd = segmentStart + segment.length;
    offset = segmentEnd;
    if (!started) {
      if (segmentEnd <= start || segmentStart < start) continue;
      started = true;
    }
    if (length + segment.length > limit) break;
    result += segment;
    length += segment.length;
  }
  return result;
}

export function truncatePreviewText(
  value: string,
  maxCodeUnits = CHAT_PREVIEW_MAX_CODE_UNITS
): string {
  return slicePreviewText(value, 0, maxCodeUnits);
}
