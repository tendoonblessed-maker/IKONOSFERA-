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
// Keep the latest edits in this tab if sessionStorage throws or reaches quota.
const volatileDrafts=new Map<string,GroupDrafts>();
const unsavedOwners=new Set<string>();
function store():Storage|null{
 try{return typeof window==='undefined'?null:window.sessionStorage;}
 catch{return null;}
}
function key(ownerId:string){return PREFIX+ownerId;}

/** Retry a pending write or sign-out tombstone as soon as storage is usable. */
function flushPendingGroupDrafts(ownerId:string):void{
 if(!unsavedOwners.has(ownerId))return;
 try{
  const storage=store();
  if(!storage)return;
  const drafts=volatileDrafts.get(ownerId)??{};
  if(Object.keys(drafts).length)storage.setItem(key(ownerId),JSON.stringify(drafts));
  else storage.removeItem(key(ownerId));
  unsavedOwners.delete(ownerId);
 }catch{/* Keep the latest draft/tombstone until storage recovers. */}
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
 // Flush before reading so recovered storage cannot later resurrect stale text.
 flushPendingGroupDrafts(ownerId);
 // If storage is still unavailable, the current tab's snapshot/tombstone wins.
 if(unsavedOwners.has(ownerId))return {...(volatileDrafts.get(ownerId)??{})};
 try{
  const storage=store();
  if(!storage)return {...(volatileDrafts.get(ownerId)??{})};
  const item=storage.getItem(key(ownerId));
  return item?cleanGroupDrafts(JSON.parse(item)):{};
 }catch{return {...(volatileDrafts.get(ownerId)??{})};}
}
export function writeGroupDraft(ownerId:string,groupId:string,text:string):GroupDrafts{
 if(!UUID.test(ownerId)||!UUID.test(groupId))return {};
 const next=readGroupDrafts(ownerId);
 // Move edited drafts to the end before enforcing the storage limit.
 delete next[groupId];
 if(text.trim())next[groupId]=text.slice(0,MAX_TEXT);
 const cleaned=cleanGroupDrafts(next);
 volatileDrafts.set(ownerId,cleaned);
 unsavedOwners.add(ownerId);
 flushPendingGroupDrafts(ownerId);
 return cleaned;
}
export function clearGroupDrafts(ownerId:string):void{
 if(!UUID.test(ownerId))return;
 volatileDrafts.delete(ownerId);
 // A failed removal must not revive the signed-out account's old drafts.
 unsavedOwners.add(ownerId);
 flushPendingGroupDrafts(ownerId);
}
