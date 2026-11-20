import {apiUrl} from '@/lib/supabase-rest';
import type {GroupMessage} from '@/lib/groups';

const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
export const GROUP_OLDER_PAGE_SIZE=70;
export const GROUP_HISTORY_MAX_LOADED=1500;
/** Stop requesting older pages once the retained in-memory window reaches its cap. */
export function canLoadOlderGroupMessages(hasMore:boolean,loadedCount:number):boolean{
 return hasMore&&Number.isSafeInteger(loadedCount)&&loadedCount>=0&&loadedCount<GROUP_HISTORY_MAX_LOADED;
}

function subMillisecondFraction(timestamp:string):number{
 const part=/\.(\d{1,6})/.exec(timestamp)?.[1]??'';
 return Number(part.padEnd(6,'0'));
}
export function compareGroupMessages(a:GroupMessage,b:GroupMessage):number{
 const milli=Date.parse(a.created_at)-Date.parse(b.created_at);
 if(milli!==0)return milli;
 const fraction=subMillisecondFraction(a.created_at)-subMillisecondFraction(b.created_at);
 return fraction||a.id.localeCompare(b.id);
}
/** A stable cursor includes ID: many messages can have the same timestamp. */
export function olderGroupMessagesPath(groupId:string,oldest:Pick<GroupMessage,'created_at'|'id'>):string{
 if(!UUID.test(groupId)||!UUID.test(oldest.id)||!TIMESTAMP.test(oldest.created_at)
    ||!Number.isFinite(Date.parse(oldest.created_at)))throw Error('Некорректный курсор истории группы.');
 // PostgREST OR / AND is constrained by the exact group ID and user RLS.
 const cursor=oldest.created_at;
 const conditions='(created_at.lt.'+cursor+',and(created_at.eq.'+cursor+',id.lt.'+oldest.id+'))';
 const params=new URLSearchParams({
  select:'id,group_id,sender_id,body,created_at',
  group_id:'eq.'+groupId,
  or:conditions,
  order:'created_at.desc,id.desc',
  limit:String(GROUP_OLDER_PAGE_SIZE+1)
 });
 return '/rest/v1/group_messages?'+params.toString();
}
/** Validate history rows before they reach ordering, rendering, or cursor logic. */
export function normalizeOlderGroupMessageRows(data:unknown,groupId:string):GroupMessage[]{
 if(!Array.isArray(data))throw Error('Некорректные данные истории группы.');
 const rows:GroupMessage[]=[];
 const seen=new Set<string>();
 for(const value of data){
  if(!value||typeof value!=='object'||Array.isArray(value))
   throw Error('Некорректные данные истории группы.');
  const row=value as Record<string,unknown>;
  if(typeof row.group_id!=='string')throw Error('Некорректные данные истории группы.');
  // A stray row from another group is never exposed to this conversation.
  if(row.group_id!==groupId)continue;
  if(typeof row.id!=='string'||!UUID.test(row.id)
   ||typeof row.sender_id!=='string'||!UUID.test(row.sender_id)
   ||typeof row.body!=='string'||row.body.length>4000
   ||typeof row.created_at!=='string'||!TIMESTAMP.test(row.created_at)
   ||!Number.isFinite(Date.parse(row.created_at)))
   throw Error('Некорректные данные истории группы.');
  const key=row.id.toLowerCase();
  if(seen.has(key))throw Error('Некорректные данные истории группы.');
  seen.add(key);
  rows.push(value as GroupMessage);
 }
 return rows;
}
export type OlderGroupPage={messages:GroupMessage[];hasMore:boolean};
export async function fetchOlderGroupMessages(
 token:string,groupId:string,oldest:Pick<GroupMessage,'created_at'|'id'>
):Promise<OlderGroupPage>{
 const controller=new AbortController();
 const deadline=setTimeout(()=>controller.abort(),18000);
 let response:Response;
 let data:unknown;
 try{
  response=await fetch(apiUrl+olderGroupMessagesPath(groupId,oldest),{
   method:'GET',
   headers:{apikey:anonKey,Authorization:'Bearer '+token},
   cache:'no-store',
   signal:controller.signal
  });
  // Keep the deadline active through body consumption, not just response headers.
  data=await response.json().catch(()=>null);
 }finally{
  clearTimeout(deadline);
 }
 if(!response.ok||!Array.isArray(data))throw Error('Не удалось загрузить ранние сообщения.');
 const rows=normalizeOlderGroupMessageRows(data,groupId);
 // The extra result is a has-more sentinel; it must be fetched next time.
 const page=rows.slice(0,GROUP_OLDER_PAGE_SIZE);
 page.reverse();
 return {messages:page,hasMore:rows.length>GROUP_OLDER_PAGE_SIZE};
}
/** Server's newest window wins on edits/deletions; retain separately loaded
 * older pages. Never resurrect rows from the server's newest window. */
export function preserveOlderGroupMessages(
 previous:GroupMessage[],latest:GroupMessage[]
):GroupMessage[]{
 if(latest.length===0)return [];
 const boundary=latest[0];
 const rows=new Map<string,GroupMessage>();
 for(const message of previous){
  if(compareGroupMessages(message,boundary)<0)rows.set(message.id,message);
 }
 for(const message of latest)rows.set(message.id,message);
 return Array.from(rows.values()).sort(compareGroupMessages).slice(-GROUP_HISTORY_MAX_LOADED);
}
export function prependOlderGroupMessages(
 current:GroupMessage[],older:GroupMessage[]
):GroupMessage[]{
 const rows=new Map<string,GroupMessage>();
 for(const message of older)rows.set(message.id,message);
 for(const message of current)rows.set(message.id,message);
 // Current rows win if overlap occurs due to simultaneous fetching.
 return Array.from(rows.values()).sort(compareGroupMessages).slice(-GROUP_HISTORY_MAX_LOADED);
}
