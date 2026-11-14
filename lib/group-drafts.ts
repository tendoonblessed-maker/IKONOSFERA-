/**
 * Private group drafts. Stored in this tab's sessionStorage only, separately
 * per account and conversation. Never sync draft text through Supabase.
 * The prefix differs from direct-chat drafts to prevent ID collisions.
 */
const PREFIX='ikonosfera-group-drafts-tab-v1:';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_GROUPS=48;
const MAX_TEXT=4000;
const MARK=new RegExp('^'+String.fromCharCode(92)+'p{M}$','u');

export type GroupDrafts=Record<string,string>;
type GraphemeSegment={segment:string};
type GraphemeSegmenter={segment(value:string):Iterable<GraphemeSegment>};
type GraphemeSegmenterConstructor=new (
 locales?:string|string[],
 options?:{granularity:'grapheme'}
)=>GraphemeSegmenter;

// Keep a bounded per-account snapshot for this tab when sessionStorage is
// blocked or temporarily over quota. Pending empty snapshots are logout
// tombstones: a failed removeItem must not resurrect older private drafts.
const memoryDrafts=new Map<string,GroupDrafts>();
const pendingOwners=new Set<string>();

function store():Storage|null{
 try{return typeof window==='undefined'?null:window.sessionStorage;}
 catch{return null;}
}
function key(ownerId:string){return PREFIX+ownerId;}
function memorySnapshot(ownerId:string):GroupDrafts{
 return {...(memoryDrafts.get(ownerId)??{})};
}
function flushPendingDrafts(ownerId:string):void{
 if(!pendingOwners.has(ownerId))return;
 try{
  const storage=store();
  if(!storage)return;
  const drafts=memoryDrafts.get(ownerId)??{};
  if(Object.keys(drafts).length)storage.setItem(key(ownerId),JSON.stringify(drafts));
  else storage.removeItem(key(ownerId));
  pendingOwners.delete(ownerId);
 }catch{
  // Keep the newest snapshot/tombstone until browser storage recovers.
 }
}

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
function truncateDraftText(value:string,maxCodeUnits:number):string{
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

/** Retain the last 48 edited drafts; invalid entries must not evict real ones. */
export function cleanGroupDrafts(input:unknown):GroupDrafts{
 if(!input||Array.isArray(input)||typeof input!=='object')return {};
 const recent=new Map<string,string>();
 for(const [groupId,text] of Object.entries(input)){
  if(!UUID.test(groupId)||typeof text!=='string')continue;
  const limited=truncateDraftText(text,MAX_TEXT);
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
 flushPendingDrafts(ownerId);
 // Never let stale storage override an edit or a logout that is still pending.
 if(pendingOwners.has(ownerId))return memorySnapshot(ownerId);
 try{
  const storage=store();
  if(!storage)return memorySnapshot(ownerId);
  const item=storage.getItem(key(ownerId));
  // Storage eviction or an out-of-band clear must not erase a newer in-tab
  // snapshot. The explicit logout path writes an empty tombstone first.
  if(item===null){
   if(memoryDrafts.has(ownerId))return memorySnapshot(ownerId);
   memoryDrafts.set(ownerId,{});
   return {};
  }
  const parsed:unknown=JSON.parse(item);
  // Syntactically valid but malformed JSON (for example "null" or an array)
  // is not authoritative over the last known-good snapshot.
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return memorySnapshot(ownerId);
  const entries=Object.keys(parsed);
  const clean=cleanGroupDrafts(parsed);
  // A non-empty object with no valid draft entries is likely corrupt/stale.
  // Preserve the last known-good snapshot rather than silently losing text.
  if(entries.length>0&&Object.keys(clean).length===0)return memorySnapshot(ownerId);
  memoryDrafts.set(ownerId,clean);
  return {...clean};
 }catch{
  return memorySnapshot(ownerId);
 }
}
export function writeGroupDraft(ownerId:string,groupId:string,text:string):GroupDrafts{
 if(!UUID.test(ownerId)||!UUID.test(groupId))return {};
 const next=readGroupDrafts(ownerId);
 // Move edited drafts to the end before enforcing the storage limit.
 delete next[groupId];
 if(text.trim())next[groupId]=truncateDraftText(text,MAX_TEXT);
 const cleaned=cleanGroupDrafts(next);
 memoryDrafts.set(ownerId,cleaned);
 pendingOwners.add(ownerId);
 flushPendingDrafts(ownerId);
 return {...cleaned};
}
export function clearGroupDrafts(ownerId:string):void{
 if(!UUID.test(ownerId))return;
 memoryDrafts.set(ownerId,{});
 pendingOwners.add(ownerId);
 flushPendingDrafts(ownerId);
}

