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
 try{const item=store()?.getItem(key(ownerId));return item?cleanGroupDrafts(JSON.parse(item)):{};}
 catch{return {};}
}
export function writeGroupDraft(ownerId:string,groupId:string,text:string):GroupDrafts{
 if(!UUID.test(ownerId)||!UUID.test(groupId))return {};
 const next=readGroupDrafts(ownerId);
 // Move edited drafts to the end before enforcing the storage limit.
 delete next[groupId];
 if(text.trim())next[groupId]=text.slice(0,MAX_TEXT);
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
