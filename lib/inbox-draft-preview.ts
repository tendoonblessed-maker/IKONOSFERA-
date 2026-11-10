const GRAPHEME_MARK = (() => {
  try { return new RegExp("\\p{Mark}", "u"); }
  catch { return null; }
})();

type SegmenterLike = {
  segment(input: string): Iterable<{ segment: string }>;
};
type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: "grapheme" }
) => SegmenterLike;

function width(codePoint: number): number {
  return codePoint > 0xffff ? 2 : 1;
}

function isRegionalIndicator(codePoint: number): boolean {
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

function isExtend(codePoint: number): boolean {
  return (GRAPHEME_MARK?.test(String.fromCodePoint(codePoint)) ?? false)
    || codePoint === 0x200c
    || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
    || (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
    || (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)
    || (codePoint >= 0xe0020 && codePoint <= 0xe007f)
    || (codePoint >= 0xe0100 && codePoint <= 0xe01ef);
}

/** Conservative fallback for older mobile browsers without Intl.Segmenter. */
function fallbackTruncate(text: string, maxUnits: number): string {
  let offset = 0;
  let end = 0;

  while (offset < text.length) {
    const clusterStart = offset;
    let previous = text.codePointAt(offset)!;
    offset += width(previous);

    if (previous === 0x0d && text.codePointAt(offset) === 0x0a) {
      offset += 1;
    } else if (isRegionalIndicator(previous)) {
      const next = text.codePointAt(offset);
      if (next !== undefined && isRegionalIndicator(next)) offset += width(next);
    }

    while (offset < text.length) {
      const next = text.codePointAt(offset)!;
      if (isExtend(next)) {
        offset += width(next);
        continue;
      }
      if (next === 0x200d) {
        offset += 1;
        if (offset >= text.length) break;
        previous = text.codePointAt(offset)!;
        offset += width(previous);
        continue;
      }
      break;
    }

    if (offset > maxUnits) return text.slice(0, clusterStart);
    end = offset;
  }

  return text.slice(0, end);
}

/**
 * Normalize an inbox draft preview and truncate it without splitting an
 * extended grapheme cluster. The limit is measured in UTF-16 units to retain
 * the existing 110-unit inbox preview budget.
 */
export function inboxDraftPreview(value: string, maxUnits = 110): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (!Number.isFinite(maxUnits) || maxUnits <= 0) return "";
  const limit = Math.floor(maxUnits);
  if (text.length <= limit) return text;

  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  if (typeof Segmenter === "function") {
    try {
      let end = 0;
      for (const part of new Segmenter(undefined, { granularity: "grapheme" }).segment(text)) {
        if (end + part.segment.length > limit) break;
        end += part.segment.length;
      }
      return text.slice(0, end);
    } catch {
      // Fall through for partial or broken Intl.Segmenter implementations.
    }
  }

  return fallbackTruncate(text, limit);
}
