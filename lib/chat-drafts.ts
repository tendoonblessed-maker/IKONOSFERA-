/**
 * Private per-account chat drafts for the lifetime of this browser tab.
 * No message text is sent to a server or shared across accounts/windows.
 * sessionStorage is deliberately used instead of durable localStorage.
 */
const PREFIX='ikonosfera-drafts-tab-v1:';
const MAX_CHATS=48;
const MAX_TEXT=4000;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export type ChatDrafts=Record<string,string>;

function store():Storage|null{
  try{return typeof window==='undefined'?null:window.sessionStorage;}
  catch{return null;} // Safari private mode and disabled storage must work.
}
function key(userId:string){return PREFIX+userId;}

/*
 * Unicode property escapes are compiled dynamically so engines that predate
 * them can still load this module. The explicit ranges below cover common
 * combining marks when property escapes are unavailable.
 */
const MARK_PATTERN:RegExp|null=(()=>{
  try{return new RegExp('^\\p{M}$','u');}
  catch{return null;}
})();
const FALLBACK_MARK_RANGES:ReadonlyArray<readonly [number,number]>=[
  [0x0300,0x036f],[0x0483,0x0489],[0x0591,0x05bd],[0x05bf,0x05bf],
  [0x05c1,0x05c2],[0x05c4,0x05c5],[0x05c7,0x05c7],[0x0610,0x061a],
  [0x064b,0x065f],[0x0670,0x0670],[0x06d6,0x06ed],[0x0711,0x0711],
  [0x0730,0x074a],[0x07a6,0x07b0],[0x0816,0x082d],[0x08d3,0x0903],
  [0x093a,0x094f],[0x0951,0x0957],[0x0962,0x0963],[0x0981,0x0983],
  [0x09bc,0x09cd],[0x09d7,0x09d7],[0x0a01,0x0a03],[0x0a3c,0x0a4d],
  [0x0a70,0x0a71],[0x0a81,0x0a83],[0x0abc,0x0acd],[0x0b01,0x0b03],
  [0x0b3c,0x0b4d],[0x0b56,0x0b57],[0x0c00,0x0c04],[0x0c3e,0x0c56],
  [0x0d00,0x0d03],[0x0d3b,0x0d4d],[0x0d57,0x0d57],[0x0e31,0x0e31],
  [0x0e34,0x0e3a],[0x0e47,0x0e4e],[0x0f18,0x0f19],[0x0f35,0x0f39],
  [0x0f71,0x0f84],[0x102b,0x103e],[0x1056,0x1059],[0x105e,0x1060],
  [0x1062,0x1064],[0x1067,0x106d],[0x1071,0x1074],[0x1082,0x108d],
  [0x135d,0x135f],[0x1712,0x1715],[0x1732,0x1734],[0x1752,0x1753],
  [0x1772,0x1773],[0x17b4,0x17d3],[0x180b,0x180d],[0x1885,0x1886],
  [0x1ab0,0x1aff],[0x1dc0,0x1dff],[0x20d0,0x20ff],[0xfe20,0xfe2f]
];
function isExtend(character:string,codePoint:number):boolean{
  if(MARK_PATTERN?.test(character))return true;
  return codePoint===0x200c
    ||(codePoint>=0xfe00&&codePoint<=0xfe0f)
    ||(codePoint>=0xe0100&&codePoint<=0xe01ef)
    ||(codePoint>=0x1f3fb&&codePoint<=0x1f3ff)
    ||(codePoint>=0xe0020&&codePoint<=0xe007f)
    ||FALLBACK_MARK_RANGES.some(([start,end])=>codePoint>=start&&codePoint<=end);
}
function isRegionalIndicator(codePoint:number):boolean{
  return codePoint>=0x1f1e6&&codePoint<=0x1f1ff;
}
function isControl(codePoint:number):boolean{
  return (codePoint>=0&&codePoint<=0x1f)
    ||(codePoint>=0x7f&&codePoint<=0x9f)
    ||codePoint===0x2028||codePoint===0x2029;
}
function isPrepend(codePoint:number):boolean{
  return (codePoint>=0x0600&&codePoint<=0x0605)
    ||codePoint===0x06dd||codePoint===0x070f
    ||(codePoint>=0x0890&&codePoint<=0x0891)
    ||codePoint===0x08e2||codePoint===0x0d4e
    ||codePoint===0x110bd||codePoint===0x110cd
    ||(codePoint>=0x111c2&&codePoint<=0x111c3)
    ||codePoint===0x1193f||codePoint===0x11941
    ||codePoint===0x11a3a
    ||(codePoint>=0x11a84&&codePoint<=0x11a89)
    ||codePoint===0x11d46;
}
type HangulClass='L'|'V'|'T'|'LV'|'LVT'|null;
function hangulClass(codePoint:number):HangulClass{
  if((codePoint>=0x1100&&codePoint<=0x115f)||(codePoint>=0xa960&&codePoint<=0xa97c))return 'L';
  if((codePoint>=0x1160&&codePoint<=0x11a7)||(codePoint>=0xd7b0&&codePoint<=0xd7c6))return 'V';
  if((codePoint>=0x11a8&&codePoint<=0x11ff)||(codePoint>=0xd7cb&&codePoint<=0xd7fb))return 'T';
  if(codePoint>=0xac00&&codePoint<=0xd7a3)return (codePoint-0xac00)%28===0?'LV':'LVT';
  return null;
}
function joinsHangul(previous:number,current:number):boolean{
  const left=hangulClass(previous),right=hangulClass(current);
  return (left==='L'&&(right==='L'||right==='V'||right==='LV'||right==='LVT'))
    ||((left==='LV'||left==='V')&&(right==='V'||right==='T'))
    ||((left==='LVT'||left==='T')&&right==='T');
}

/**
 * Conservative extended-grapheme fallback for browsers without Intl.Segmenter.
 * It keeps common combining marks, emoji modifiers/ZWJ sequences, flag pairs,
 * prepend characters and Hangul syllable sequences together. It is not a full
 * implementation of Unicode UAX #29.
 */
function truncateFallback(text:string,limit:number):string{
  let result='',cluster='',previous=-1,regionalRun=0;
  for(const character of text){
    const current=character.codePointAt(0)!;
    let join=false;
    if(cluster){
      if(previous===0x0d&&current===0x0a)join=true;
      else if(!isControl(previous)&&!isControl(current)){
        join=isPrepend(previous)||isExtend(character,current)
          ||current===0x200d||previous===0x200d||joinsHangul(previous,current);
        if(!join&&isRegionalIndicator(previous)&&isRegionalIndicator(current))
          join=regionalRun%2===1;
      }
    }
    if(join)cluster+=character;
    else{
      result+=cluster;
      cluster=character;
    }
    if(result.length+cluster.length>limit)return result;
    if(isRegionalIndicator(current))
      regionalRun=isRegionalIndicator(previous)?regionalRun+1:1;
    else if(!isExtend(character,current)&&current!==0x200d)
      regionalRun=0;
    previous=current;
  }
  return result+cluster;
}

/** Truncate on grapheme boundaries without exceeding the UTF-16 storage cap. */
export function truncateChatDraft(text:string,maxCodeUnits=MAX_TEXT):string{
  if(!Number.isFinite(maxCodeUnits)||maxCodeUnits<=0)return '';
  const limit=Math.floor(maxCodeUnits);
  if(text.length<=limit)return text;
  const Segmenter=Intl.Segmenter;
  if(typeof Segmenter==='function'){
    let result='';
    const segmenter=new Segmenter(undefined,{granularity:'grapheme'});
    for(const {segment} of segmenter.segment(text)){
      if(result.length+segment.length>limit)break;
      result+=segment;
    }
    return result;
  }
  return truncateFallback(text,limit);
}

/** Keep the most recently edited valid drafts when the storage cap is reached.
 * Object insertion order records edits: writers move changed IDs to the end.
 * Invalid/blank entries must not consume one of the 48 slots.
 */
export function cleanChatDrafts(input:unknown):ChatDrafts{
  if(!input||typeof input!=='object'||Array.isArray(input))return {};
  const recent=new Map<string,string>();
  for(const [chatId,text] of Object.entries(input)){
    if(!UUID.test(chatId)||typeof text!=='string')continue;
    const limited=truncateChatDraft(text);
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
  const limited=truncateChatDraft(text);
  if(limited.trim())next[chatId]=limited;
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
