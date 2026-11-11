import {apiUrl} from './supabase-rest';
import type {GroupMessage} from './groups';
import {slicePreviewText,truncatePreviewText} from './text-preview';

const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??'';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const GROUP_SEARCH_PAGE_SIZE=24;
export const GROUP_SEARCH_MAX_OFFSET=480;
const MESSAGE_FIELDS='id,group_id,sender_id,body,created_at';
const REQUEST_TIMEOUT_MS=18000;

type RequestScope={signal:AbortSignal;cleanup:()=>void};

/** Keep the existing deadline while allowing a screen lifecycle to cancel the GET. */
function createRequestScope(parent?:AbortSignal):RequestScope{
 const controller=new AbortController();
 const abort=()=>controller.abort();
 if(parent?.aborted)controller.abort();
 else parent?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,REQUEST_TIMEOUT_MS);
 return {
  signal:controller.signal,
  cleanup:()=>{
   clearTimeout(timer);
   parent?.removeEventListener('abort',abort);
  }
 };
}

function createAbortError():Error{
 const error=new Error('Запрос отменён.');
 error.name='AbortError';
 return error;
}

/**
 * Searches the complete group history with the existing member-only SELECT
 * RLS on group_messages. No service_role key or privileged SQL RPC.
 */
export function normalizeGroupSearch(query:string):string{
 return truncatePreviewText(query.trim().replace(/\s+/g,' '),120);
}

function localeInsensitiveIndex(value:string,query:string):number{
 const needle=query.toLocaleLowerCase('ru');
 if(!needle)return -1;
 let folded='';
 const originalOffsets:number[]=[];
 let offset=0;
 for(const point of value){
  const lower=point.toLocaleLowerCase('ru');
  folded+=lower;
  for(let i=0;i<lower.length;i++)originalOffsets.push(offset);
  offset+=point.length;
 }
 const match=folded.indexOf(needle);
 return match<0?-1:originalOffsets[match]??-1;
}

/** Build a bounded search excerpt without splitting an emoji or grapheme. */
export function groupSearchExcerpt(body:string,query:string):string{
 const flat=body.replace(/\s+/g,' ').trim();
 if(!flat)return '';
 const index=localeInsensitiveIndex(flat,normalizeGroupSearch(query));
 const targetStart=index<0?0:Math.max(0,index-45);
 const prefix=truncatePreviewText(flat,targetStart);
 const start=prefix.length;
 const excerpt=slicePreviewText(flat,start,180);
 return (start>0?'…':'')+excerpt+(start+excerpt.length<flat.length?'…':'');
}

export function buildGroupSearchPath(groupId:string,query:string,offset:number):string{
 if(!UUID.test(groupId))throw Error('Некорректная группа');
 const term=normalizeGroupSearch(query);
 if(term.length<2||offset<0||offset>GROUP_SEARCH_MAX_OFFSET||
    !Number.isSafeInteger(offset)||offset%GROUP_SEARCH_PAGE_SIZE!==0)
  throw Error('Введите не меньше двух символов для поиска.');
 // PostgreSQL ILIKE escapes %, _ and backslashes. PostgREST additionally
 // requires quoting filter values with commas/periods/parentheses.
 // Avoid * wildcard alias entirely (unsupported as a literal query token).
 if(term.includes('*'))throw Error('Поиск по символу * пока не поддерживается.');
 const escaped=term.replace(/\\/g,'\\\\').replace(/[%_]/g,'\\$&').replace(/"/g,'\\"');
 const params=new URLSearchParams({
  select:MESSAGE_FIELDS,
  group_id:'eq.'+groupId,
  body:'ilike."%'+escaped+'%"',
  order:'created_at.desc,id.desc',
  limit:String(GROUP_SEARCH_PAGE_SIZE+1),
  offset:String(offset)
 });
 return '/rest/v1/group_messages?'+params;
}

async function getRows(token:string,params:URLSearchParams,signal?:AbortSignal):Promise<GroupMessage[]>{
 const request=createRequestScope(signal);
 try{
  const response=await fetch(apiUrl+'/rest/v1/group_messages?'+params,{
   method:'GET',
   headers:{apikey:anonKey,Authorization:'Bearer '+token},
   cache:'no-store',signal:request.signal
  });
  let data:unknown;
  try{data=await response.json();}
  catch(error){if(request.signal.aborted)throw error;data=null;}
  if(request.signal.aborted)throw createAbortError();
  if(!response.ok||!Array.isArray(data))
   throw Error('Не удалось загрузить историю группы. Проверь соединение.');
  return data as GroupMessage[];
 }finally{
  request.cleanup();
 }
}

export async function searchGroupMessages(
 token:string,groupId:string,query:string,offset:number,signal?:AbortSignal
):Promise<GroupMessage[]>{
 const path=buildGroupSearchPath(groupId,query,offset);
 const request=createRequestScope(signal);
 try{
  const res=await fetch(apiUrl+path,{
   method:'GET',
   headers:{apikey:anonKey,Authorization:'Bearer '+token},
   cache:'no-store',signal:request.signal
  });
  let data:unknown;
  try{data=await res.json();}
  catch(error){if(request.signal.aborted)throw error;data=null;}
  if(request.signal.aborted)throw createAbortError();
  if(!res.ok||!Array.isArray(data))throw Error('Не удалось выполнить поиск по группе.');
  return data as GroupMessage[];
 }finally{
  request.cleanup();
 }
}

/** Returns a bounded, chronologically sorted window around a search hit.
 * Every GET is limited to ONE group and uses the regular user's RLS.
 * The target is checked again in case membership has been revoked.
 */
export async function getGroupMessageContext(
 token:string,groupId:string,targetId:string,createdAt:string,signal?:AbortSignal
):Promise<GroupMessage[]>{
 if(!UUID.test(groupId)||!UUID.test(targetId)||
    !Number.isFinite(Date.parse(createdAt)))throw Error('Некорректное сообщение.');
 const controller=new AbortController();
 const abort=()=>controller.abort();
 if(signal?.aborted)controller.abort();
 else signal?.addEventListener('abort',abort,{once:true});
 try{
  const base={select:MESSAGE_FIELDS,group_id:'eq.'+groupId};
  const exact=new URLSearchParams({...base,id:'eq.'+targetId,limit:'1'});
  const target=(await getRows(token,exact,controller.signal))[0];
  if(!target||target.id!==targetId||target.group_id!==groupId)
   throw Error('Сообщение удалено или больше недоступно.');
  const older=new URLSearchParams({...base,created_at:'lte.'+target.created_at,order:'created_at.desc,id.desc',limit:'70'});
  const newer=new URLSearchParams({...base,created_at:'gte.'+target.created_at,order:'created_at.asc,id.asc',limit:'70'});
  // If either side fails, abort its sibling instead of leaving a background GET.
  const [before,after]=await Promise.all([
   getRows(token,older,controller.signal),
   getRows(token,newer,controller.signal)
  ]);
  const map=new Map<string,GroupMessage>();
  for(const message of [...before,...after,target]){
   if(message.group_id===groupId)map.set(message.id,message);
  }
  return Array.from(map.values()).sort((a,b)=>
   Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id));
 }catch(error){
  controller.abort();
  throw error;
 }finally{
  signal?.removeEventListener('abort',abort);
 }
}
