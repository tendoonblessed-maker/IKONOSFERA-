/**
 * Private group drafts. Stored in this tab's sessionStorage only, separately
 * per account and conversation. Never sync draft text through Supabase.
 * The prefix differs from direct-chat drafts to prevent ID collisions.
 */
const PREFIX='ikonosfera-group-drafts-tab-v1:';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_GROUPS=48;
const MAX_TEXT=4000;
export type GroupDrafts=Record<string,string>;

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
/** Retain the last 48 edited drafts; invalid entries must not evict real ones. */
export function cleanGroupDrafts(input:unknown):GroupDrafts{
 if(!input||Array.isArray(input)||typeof input!=='object')return {};
 const recent=new Map<string,string>();
 for(const [groupId,text] of Object.entries(input)){
  if(!UUID.test(groupId)||typeof text!=='string')continue;
  const limited=text.slice(0,MAX_TEXT);
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
 if(pendingOwners.has(ownerId))return {...(memoryDrafts.get(ownerId)??{})};
 try{
  const storage=store();
  if(!storage)return {...(memoryDrafts.get(ownerId)??{})};
  const item=storage.getItem(key(ownerId));
  const clean=item?cleanGroupDrafts(JSON.parse(item)):{};
  memoryDrafts.set(ownerId,clean);
  return {...clean};
 }catch{
  return {...(memoryDrafts.get(ownerId)??{})};
 }
}
export function writeGroupDraft(ownerId:string,groupId:string,text:string):GroupDrafts{
 if(!UUID.test(ownerId)||!UUID.test(groupId))return {};
 const next=readGroupDrafts(ownerId);
 // Move edited drafts to the end before enforcing the storage limit.
 delete next[groupId];
 if(text.trim())next[groupId]=text.slice(0,MAX_TEXT);
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
