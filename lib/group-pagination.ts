import {apiUrl} from '@/lib/supabase-rest';
import type {GroupMessage} from '@/lib/groups';

const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
export const GROUP_OLDER_PAGE_SIZE=70;
export const GROUP_HISTORY_MAX_LOADED=1500;
export const GROUP_OLDER_MAX_ATTEMPTS=2;
export const GROUP_OLDER_RETRY_MAX_DELAY_MS=3000;

function subMillisecondFraction(timestamp:string):number{
 const part=/\.(\d{1,6})/.exec(timestamp)?.[1]??'';
 return Number(part.padEnd(6,'0'));
}
export function compareGroupMessages(
 a:Pick<GroupMessage,'created_at'|'id'>,b:Pick<GroupMessage,'created_at'|'id'>
):number{
 const milli=Date.parse(a.created_at)-Date.parse(b.created_at);
 if(milli!==0)return milli;
 const fraction=subMillisecondFraction(a.created_at)-subMillisecondFraction(b.created_at);
 return fraction||a.id.localeCompare(b.id);
}
function isGroupMessageRow(value:unknown,groupId:string):value is GroupMessage{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const row=value as Record<string,unknown>;
 return typeof row.id==='string'&&UUID.test(row.id)
  &&typeof row.group_id==='string'&&row.group_id.toLowerCase()===groupId.toLowerCase()
  &&typeof row.sender_id==='string'&&UUID.test(row.sender_id)
  &&typeof row.body==='string'
  &&typeof row.created_at==='string'&&TIMESTAMP.test(row.created_at)
  &&Number.isFinite(Date.parse(row.created_at));
}
/** Parse Retry-After delta-seconds or HTTP-date without trusting invalid values. */
export function parseGroupRetryAfter(value:string|null,now=Date.now()):number|null{
 if(!value)return null;
 const normalized=value.trim();
 if(!normalized)return null;
 if(/^\d+$/.test(normalized)){
  const seconds=Number(normalized);
  return Number.isSafeInteger(seconds)?seconds*1000:null;
 }
 const date=Date.parse(normalized);
 return Number.isFinite(date)?Math.max(0,date-now):null;
}
function transientNetworkError(error:unknown):boolean{
 if(!error||typeof error!=='object')return false;
 const name=(error as {name?:unknown}).name;
 return name==='TypeError'||name==='TimeoutError';
}
function retryDelay(response:Response,attempt:number):number|null{
 if(![408,425,429,500,502,503,504].includes(response.status))return null;
 const retryAfter=parseGroupRetryAfter(response.headers?.get('Retry-After')??null);
 if(retryAfter!==null&&retryAfter>GROUP_OLDER_RETRY_MAX_DELAY_MS)return null;
 const fallback=response.status===429?1000:350*Math.pow(2,attempt-1);
 return Math.max(fallback,retryAfter??0);
}
function waitForRetry(delay:number):Promise<void>{
 return new Promise(resolve=>setTimeout(resolve,delay));
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
export async function fetchOlderGroupMessages(
 token:string,groupId:string,oldest:Pick<GroupMessage,'created_at'|'id'>
):Promise<OlderGroupPage>{
 const url=apiUrl+olderGroupMessagesPath(groupId,oldest);
 let response:Response|undefined;
 for(let attempt=1;attempt<=GROUP_OLDER_MAX_ATTEMPTS;attempt++){
  try{
   response=await fetch(url,{
    method:'GET',
    headers:{apikey:anonKey,Authorization:'Bearer '+token},
    cache:'no-store',
    signal:AbortSignal.timeout(18000)
   });
  }catch(error){
   if(attempt<GROUP_OLDER_MAX_ATTEMPTS&&transientNetworkError(error)){
    await waitForRetry(350*Math.pow(2,attempt-1));
    continue;
   }
   throw Error('Не удалось загрузить ранние сообщения. Проверьте соединение и повторите попытку.');
  }
  if(!response.ok){
   const delay=attempt<GROUP_OLDER_MAX_ATTEMPTS?retryDelay(response,attempt):null;
   if(delay!==null){
    await waitForRetry(delay);
    continue;
   }
   if(response.status===429)throw Error('Сервер временно ограничил загрузку истории. Повторите попытку позже.');
   if(response.status>=500)throw Error('Сервер временно недоступен. Повторите попытку позже.');
   throw Error('Не удалось загрузить ранние сообщения.');
  }
  const data:unknown=await response.json().catch(()=>null);
  if(!Array.isArray(data)||data.length>GROUP_OLDER_PAGE_SIZE+1)
   throw Error('Не удалось загрузить ранние сообщения.');
  const rows:GroupMessage[]=[];
  const seen=new Set<string>();
  for(const value of data){
   if(!isGroupMessageRow(value,groupId))throw Error('Не удалось загрузить ранние сообщения.');
   const messageId=value.id.toLowerCase();
   // A duplicate, foreign or malformed row makes the whole snapshot untrusted.
   if(seen.has(messageId)||compareGroupMessages(value,oldest)>=0
      ||(rows.length>0&&compareGroupMessages(rows[rows.length-1],value)<=0))
    throw Error('Не удалось загрузить ранние сообщения.');
   seen.add(messageId);
   rows.push(value);
  }
  // The extra result is a has-more sentinel; it must be fetched next time.
  const page=rows.slice(0,GROUP_OLDER_PAGE_SIZE);
  page.reverse();
  return {messages:page,hasMore:rows.length>GROUP_OLDER_PAGE_SIZE};
 }
 throw Error('Не удалось загрузить ранние сообщения.');
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
