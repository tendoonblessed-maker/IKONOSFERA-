import {apiUrl} from '@/lib/supabase-rest';
import type {GroupMessage} from '@/lib/groups';

const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
export const GROUP_OLDER_PAGE_SIZE=70;
export const GROUP_HISTORY_MAX_LOADED=1500;

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
export type OlderGroupPage={messages:GroupMessage[];hasMore:boolean};
function validateOlderGroupRow(value:unknown,groupId:string):GroupMessage{
 if(!value||typeof value!=='object')throw Error('Некорректный ответ истории группы.');
 const row=value as Partial<GroupMessage>;
 if(row.group_id!==groupId)return row as GroupMessage;
 if(typeof row.id!=='string'||!UUID.test(row.id)
  ||typeof row.sender_id!=='string'||!UUID.test(row.sender_id)
  ||typeof row.body!=='string'
  ||typeof row.created_at!=='string'||!TIMESTAMP.test(row.created_at)
  ||!Number.isFinite(Date.parse(row.created_at)))
  throw Error('Некорректное сообщение в истории группы.');
 return row as GroupMessage;
}
export async function fetchOlderGroupMessages(
 token:string,groupId:string,oldest:Pick<GroupMessage,'created_at'|'id'>
):Promise<OlderGroupPage>{
 const response=await fetch(apiUrl+olderGroupMessagesPath(groupId,oldest),{
  method:'GET',
  headers:{apikey:anonKey,Authorization:'Bearer '+token},
  cache:'no-store',
  signal:AbortSignal.timeout(18000)
 });
 const data:unknown=await response.json().catch(()=>null);
 if(!response.ok||!Array.isArray(data))throw Error('Не удалось загрузить ранние сообщения.');
 const rows:GroupMessage[]=[];
 const seen=new Set<string>();
 for(const item of data){
  const row=validateOlderGroupRow(item,groupId);
  if(row.group_id!==groupId)continue;
  if(seen.has(row.id))throw Error('Повторяющееся сообщение в истории группы.');
  seen.add(row.id);
  rows.push(row);
 }
 // The server's extra raw row is the has-more sentinel, even if a stray
 // foreign-group row is filtered from the visible page.
 const page=rows.slice(0,GROUP_OLDER_PAGE_SIZE);
 page.reverse();
 return {messages:page,hasMore:data.length>GROUP_OLDER_PAGE_SIZE};
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
