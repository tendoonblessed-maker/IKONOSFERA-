/**
 * Private group drafts. Stored in this tab's sessionStorage only, separately
 * per account and conversation. Never sync draft text through Supabase.
 * The prefix differs from direct-chat drafts to prevent ID collisions.
 */
const PREFIX='ikonosfera-group-drafts-tab-v1:';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_GROUPS=48;
const MAX_TEXT=4000;

const GRAPHEME_MARK = (() => {
  try { return new RegExp('\\p{Mark}', 'u'); }
  catch { return null; }
})();
type IntlSegmenterLike = {
  Segmenter?: new (
    locales?: string | string[],
    options?: { granularity: 'grapheme' }
  ) => { segment(input: string): Iterable<{ segment: string }> };
};

function isGraphemeExtend(codePoint: number): boolean {
  const isMark = GRAPHEME_MARK?.test(String.fromCodePoint(codePoint)) ?? false;
  return isMark ||
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    codePoint === 0x200c ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xfe20 && codePoint <= 0xfe2f) ||
    (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff) ||
    (codePoint >= 0xe0020 && codePoint <= 0xe007f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef);
}

function isRegionalIndicator(codePoint: number): boolean {
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

function hangulType(codePoint: number): 'L' | 'V' | 'T' | 'LV' | 'LVT' | null {
  if ((codePoint >= 0x1100 && codePoint <= 0x115f) ||
      (codePoint >= 0xa960 && codePoint <= 0xa97c)) return 'L';
  if ((codePoint >= 0x1160 && codePoint <= 0x11a7) ||
      (codePoint >= 0xd7b0 && codePoint <= 0xd7c6)) return 'V';
  if ((codePoint >= 0x11a8 && codePoint <= 0x11ff) ||
      (codePoint >= 0xd7cb && codePoint <= 0xd7fb)) return 'T';
  if (codePoint >= 0xac00 && codePoint <= 0xd7a3) {
    return (codePoint - 0xac00) % 28 === 0 ? 'LV' : 'LVT';
  }
  return null;
}

function joinsHangul(previous: number, next: number): boolean {
  const left = hangulType(previous);
  const right = hangulType(next);
  return (left === 'L' && (right === 'L' || right === 'V' || right === 'LV' || right === 'LVT')) ||
    ((left === 'LV' || left === 'V') && (right === 'V' || right === 'T')) ||
    ((left === 'LVT' || left === 'T') && right === 'T');
}

/** Conservative grapheme fallback for browsers without Intl.Segmenter. */
function fallbackLimitDraftText(text: string): string {
  let offset = 0;
  while (offset < text.length) {
    const clusterStart = offset;
    let previous = text.codePointAt(offset)!;
    offset += previous > 0xffff ? 2 : 1;

    if (previous === 0x0d && text.codePointAt(offset) === 0x0a) {
      offset += 1;
    } else if (isRegionalIndicator(previous)) {
      const next = text.codePointAt(offset);
      if (next !== undefined && isRegionalIndicator(next)) {
        offset += next > 0xffff ? 2 : 1;
      }
    }

    while (offset < text.length) {
      const next = text.codePointAt(offset)!;
      if (isGraphemeExtend(next)) {
        offset += next > 0xffff ? 2 : 1;
        continue;
      }
      if (next === 0x200d) {
        offset += 1;
        if (offset >= text.length) break;
        previous = text.codePointAt(offset)!;
        offset += previous > 0xffff ? 2 : 1;
        continue;
      }
      if (joinsHangul(previous, next)) {
        previous = next;
        offset += next > 0xffff ? 2 : 1;
        continue;
      }
      break;
    }

    if (offset > MAX_TEXT) return text.slice(0, clusterStart);
  }
  return text.slice(0, offset);
}

/** Truncate at extended grapheme boundaries; keep common emoji intact on older browsers. */
function limitDraftText(text: string): string {
  if (text.length <= MAX_TEXT) return text;
  const Segmenter = (Intl as unknown as IntlSegmenterLike).Segmenter;
  if (typeof Segmenter === 'function') {
    try {
      const segmenter = new Segmenter(undefined, { granularity: 'grapheme' });
      let end = 0;
      for (const part of segmenter.segment(text)) {
        if (end + part.segment.length > MAX_TEXT) break;
        end += part.segment.length;
      }
      return text.slice(0, end);
    } catch {
      // Fall through for partial or broken Intl.Segmenter implementations.
    }
  }
  return fallbackLimitDraftText(text);
}
export type GroupDrafts=Record<string,string>;
function store():Storage|null{
 try{return typeof window==='undefined'?null:window.sessionStorage;}
 catch{return null;}
}
function key(ownerId:string){return PREFIX+ownerId;}
/** Retain the last 48 edited drafts; invalid entries must not evict real ones. */
export function cleanGroupDrafts(input:unknown):GroupDrafts{
 if(!input||Array.isArray(input)||typeof input!=='object')return {};
 const recent=new Map<string,string>();
 for(const [groupId,text] of Object.entries(input)){
  if(!UUID.test(groupId)||typeof text!=='string')continue;
  const limited=limitDraftText(text);
  if(!limited.trim())continue;
  recent.set(groupId,limited);
  if(recent.size>MAX_GROUPS){
   const oldest=recent.keys().next().value;
   if(oldest!==undefined)recent.delete(oldest);
  }
 }
 return Object.fromEntries(recent);
}
export function readGroupDrafts(ownerId:string):GroupDrafts{
 if(!UUID.test(ownerId))return {};
 try{const item=store()?.getItem(key(ownerId));return item?cleanGroupDrafts(JSON.parse(item)):{};}
 catch{return {};}
}
export function writeGroupDraft(ownerId:string,groupId:string,text:string):GroupDrafts{
 if(!UUID.test(ownerId)||!UUID.test(groupId))return {};
 const next=readGroupDrafts(ownerId);
 // Move edited drafts to the end before enforcing the storage limit.
 delete next[groupId];
 if(text.trim())next[groupId]=limitDraftText(text);
 const cleaned=cleanGroupDrafts(next);
 try{
  const storage=store();
  if(storage){
   if(Object.keys(cleaned).length)storage.setItem(key(ownerId),JSON.stringify(cleaned));
   else storage.removeItem(key(ownerId));
  }
 }catch{/* Storage disabled/full: keep typing working in memory. */}
 return cleaned;
}
export function clearGroupDrafts(ownerId:string):void{
 if(!UUID.test(ownerId))return;
 try{store()?.removeItem(key(ownerId));}catch{}
}
