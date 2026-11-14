/**
 * Private per-account chat drafts for the lifetime of this browser tab.
 * No message text is sent to a server or shared across accounts/windows.
 * sessionStorage is deliberately used instead of durable localStorage.
 */
const PREFIX='ikonosfera-drafts-tab-v1:';
const MAX_CHATS=48;
const MAX_TEXT=4000;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MARK=new RegExp('^\\p{M}$','u');

export type ChatDrafts=Record<string,string>;

type GraphemeSegment={segment:string};
type GraphemeSegmenter={segment(value:string):Iterable<GraphemeSegment>};
type GraphemeSegmenterConstructor=new (
  locales?:string|string[],
  options?:{granularity:'grapheme'}
)=>GraphemeSegmenter;

// Keep the latest draft in this tab when sessionStorage is temporarily
// unavailable (private browsing, quota errors, blocked cookies). Pending
// writes are retried before a read, including empty writes from sign-out:
// otherwise a failed removeItem could resurrect an old private draft.
const memoryDrafts=new Map<string,ChatDrafts>();
const pendingOwners=new Set<string>();

function flushPendingDrafts(userId:string):void{
  if(!pendingOwners.has(userId))return;
  try{
    const storage=store();
    if(!storage)return;
    const drafts=memoryDrafts.get(userId)??{};
    if(Object.keys(drafts).length)storage.setItem(key(userId),JSON.stringify(drafts));
    else storage.removeItem(key(userId));
    pendingOwners.delete(userId);
  }catch{/* Keep the pending draft/tombstone until storage recovers. */}
}

function store():Storage|null{
  try{return typeof window==='undefined'?null:window.sessionStorage;}
  catch{return null;} // Safari private mode and disabled storage must work.
}
function key(userId:string){return PREFIX+userId;}

function isGraphemeExtend(point:string):boolean{
  const code=point.codePointAt(0)??0;
  return MARK.test(point)
    ||(code>=0xfe00&&code<=0xfe0f)
    ||(code>=0xe0100&&code<=0xe01ef)
    ||(code>=0x1f3fb&&code<=0x1f3ff)
    ||(code>=0xe0020&&code<=0xe007f);
}

/**
 * Conservative fallback for browsers without Intl.Segmenter. It keeps
 * surrogate pairs (Array.from), combining marks, variation selectors,
 * emoji modifiers, flag pairs and common ZWJ emoji sequences together.
 */
function fallbackGraphemeClusters(value:string):string[]{
  const clusters:string[]=[];
  let cluster='';
  let previousCode=0;
  let regionalIndicators=0;
  for(const point of Array.from(value)){
    const code=point.codePointAt(0)??0;
    const regional=code>=0x1f1e6&&code<=0x1f1ff;
    const joins=cluster.length>0&&(
      isGraphemeExtend(point)
      ||code===0x200d
      ||previousCode===0x200d
      ||(previousCode===0x0d&&code===0x0a)
      ||(regional&&regionalIndicators===1)
    );
    if(!joins){
      if(cluster)clusters.push(cluster);
      cluster=point;
      regionalIndicators=regional?1:0;
    }else{
      cluster+=point;
      if(regional)regionalIndicators++;
    }
    previousCode=code;
  }
  if(cluster)clusters.push(cluster);
  return clusters;
}

/** Limit UTF-16 storage size without cutting a user-perceived character. */
export function truncateDraftText(value:string,maxCodeUnits:number):string{
  const limit=Math.max(0,Math.floor(maxCodeUnits));
  if(value.length<=limit)return value;
  if(limit===0)return '';
  const Segmenter=(Intl as unknown as {Segmenter?:GraphemeSegmenterConstructor}).Segmenter;
  const segments=typeof Segmenter==='function'
    ?new Segmenter(undefined,{granularity:'grapheme'}).segment(value)
    :fallbackGraphemeClusters(value);
  let result='';
  let length=0;
  for(const item of segments){
    const segment=typeof item==='string'?item:item.segment;
    if(length+segment.length>limit)break;
    result+=segment;
    length+=segment.length;
  }
  return result;
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
    const limited=truncateDraftText(text,MAX_TEXT);
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
  if(text.trim())next[chatId]=truncateDraftText(text,MAX_TEXT);
  return cleanChatDrafts(next);
}

/**
 * Return null for an unavailable/corrupt snapshot so it cannot erase the
 * last-known-good in-tab copy. A missing key is different: successful clear
 * removes the key, so absence is authoritative and must clear old memory.
 * A valid empty object is also an intentional empty snapshot.
 */
function parseStoredDrafts(value:string|null):ChatDrafts|null{
  if(value===null)return {};
  let parsed:unknown;
  try{parsed=JSON.parse(value);}catch{return null;}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return null;
  const clean=cleanChatDrafts(parsed);
  if(Object.keys(parsed).length>0&&Object.keys(clean).length===0)return null;
  return clean;
}

export function readChatDrafts(userId:string):ChatDrafts{
  if(!UUID.test(userId))return {};
  flushPendingDrafts(userId);
  // A stale storage value must never override an unsaved edit or logout.
  if(pendingOwners.has(userId))return {...(memoryDrafts.get(userId)??{})};
  try{
    const storage=store();
    if(!storage)return {...(memoryDrafts.get(userId)??{})};
    const clean=parseStoredDrafts(storage.getItem(key(userId)));
    if(clean===null)return {...(memoryDrafts.get(userId)??{})};
    memoryDrafts.set(userId,clean);
    return {...clean};
  }catch{return {...(memoryDrafts.get(userId)??{})};}
}
export function writeChatDrafts(userId:string,drafts:ChatDrafts):void{
  if(!UUID.test(userId))return;
  memoryDrafts.set(userId,cleanChatDrafts(drafts));
  pendingOwners.add(userId);
  flushPendingDrafts(userId);
}
export function clearChatDrafts(userId:string):void{
  if(!UUID.test(userId))return;
  memoryDrafts.set(userId,{});
  pendingOwners.add(userId);
  flushPendingDrafts(userId);
}
