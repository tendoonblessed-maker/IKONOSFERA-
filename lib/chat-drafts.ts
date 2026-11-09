/**
 * Private per-account chat drafts for the lifetime of this browser tab.
 * No message text is sent to a server or shared across accounts/windows.
 * sessionStorage is deliberately used instead of durable localStorage.
 */
const PREFIX='ikonosfera-drafts-tab-v1:';
const MAX_CHATS=48;
const MAX_TEXT=4000;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

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
export type ChatDrafts=Record<string,string>;

function store():Storage|null{
  try{return typeof window==='undefined'?null:window.sessionStorage;}
  catch{return null;} // Safari private mode and disabled storage must work.
}
function key(userId:string){return PREFIX+userId;}
/** Keep the most recently edited valid drafts when the storage cap is reached.
 * Object insertion order records edits: writers move changed IDs to the end.
 * Invalid/blank entries must not consume one of the 48 slots.
 */
export function cleanChatDrafts(input:unknown):ChatDrafts{
  if(!input||typeof input!=='object'||Array.isArray(input))return {};
  const recent=new Map<string,string>();
  for(const [chatId,text] of Object.entries(input)){
    if(!UUID.test(chatId)||typeof text!=='string')continue;
    const limited=limitDraftText(text);
    if(!limited.trim())continue;
    recent.set(chatId,limited);
    if(recent.size>MAX_CHATS){
      const oldest=recent.keys().next().value;
      if(oldest!==undefined)recent.delete(oldest);
    }
  }
  return Object.fromEntries(recent);
}

/** Update both the draft contents and its recency, bounded in memory as well. */
export function updateChatDraftEntry(drafts:ChatDrafts,chatId:string,text:string):ChatDrafts{
  const next=cleanChatDrafts(drafts);
  if(!UUID.test(chatId))return next;
  delete next[chatId];
  if(text.trim())next[chatId]=limitDraftText(text);
  return cleanChatDrafts(next);
}
export function readChatDrafts(userId:string):ChatDrafts{
  if(!UUID.test(userId))return {};
  try{
    const value=store()?.getItem(key(userId));
    return value?cleanChatDrafts(JSON.parse(value)):{};
  }catch{return {};}
}
export function writeChatDrafts(userId:string,drafts:ChatDrafts):void{
  if(!UUID.test(userId))return;
  try{
    const storage=store();
    if(!storage)return;
    const clean=cleanChatDrafts(drafts);
    if(Object.keys(clean).length)storage.setItem(key(userId),JSON.stringify(clean));
    else storage.removeItem(key(userId));
  }catch{/* Storage quotas/disabled cookies must never block message typing. */}
}
export function clearChatDrafts(userId:string):void{
  if(!UUID.test(userId))return;
  try{store()?.removeItem(key(userId));}catch{}
}
