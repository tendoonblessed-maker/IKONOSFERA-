import {apiUrl} from './supabase-rest';
import type {GroupMessage} from './groups';
import {compareGroupMessages} from './group-pagination';

const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??'';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
export const GROUP_SEARCH_PAGE_SIZE=24;
export const GROUP_SEARCH_MAX_OFFSET=480;
const MESSAGE_FIELDS='id,group_id,sender_id,body,created_at';

/**
 * Searches the complete group history with the existing member-only SELECT
 * RLS on group_messages. No service_role key or privileged SQL RPC.
 */
export function normalizeGroupSearch(query:string):string{
 return query.trim().replace(/\s+/g,' ').slice(0,120);
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

async function getRows(token:string,params:URLSearchParams):Promise<GroupMessage[]>{
 const response=await fetch(apiUrl+'/rest/v1/group_messages?'+params,{
  method:'GET',
  headers:{apikey:anonKey,Authorization:'Bearer '+token},
  cache:'no-store',signal:AbortSignal.timeout(18000)
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok||!Array.isArray(data))
  throw Error('Не удалось загрузить историю группы. Проверь соединение.');
 return data as GroupMessage[];
}

export async function searchGroupMessages(
 token:string,groupId:string,query:string,offset:number
):Promise<GroupMessage[]>{
 const path=buildGroupSearchPath(groupId,query,offset);
 const res=await fetch(apiUrl+path,{
  method:'GET',
  headers:{apikey:anonKey,Authorization:'Bearer '+token},
  cache:'no-store',signal:AbortSignal.timeout(18000)
 });
 const data=await res.json().catch(()=>null);
 if(!res.ok||!Array.isArray(data))throw Error('Не удалось выполнить поиск по группе.');
 return data as GroupMessage[];
}

/** Returns a bounded, chronologically sorted window around a search hit.
 * Every GET is limited to ONE group and uses the regular user's RLS.
 * The target is checked again in case membership has been revoked.
 */
export async function getGroupMessageContext(
 token:string,groupId:string,targetId:string,createdAt:string
):Promise<GroupMessage[]>{
 if(!UUID.test(groupId)||!UUID.test(targetId)||
    !Number.isFinite(Date.parse(createdAt)))throw Error('Некорректное сообщение.');
 const base={select:MESSAGE_FIELDS,group_id:'eq.'+groupId};
 const exact=new URLSearchParams({...base,id:'eq.'+targetId,limit:'1'});
 const target=(await getRows(token,exact))[0];
 if(!target||target.id!==targetId||target.group_id!==groupId)
  throw Error('Сообщение удалено или больше недоступно.');
 // The canonical timestamp comes from the RLS-checked row, never from
 // the caller. Validate before interpolating it into PostgREST filters.
 if(!TIMESTAMP.test(target.created_at)||!Number.isFinite(Date.parse(target.created_at)))
  throw Error('Некорректная дата сообщения.');
 // Timestamp-only lte/gte pages skip the target's nearest neighbours when
 // 70+ messages share one timestamp. Use the UUID as a stable tie-breaker.
 const olderCursor='(created_at.lt.'+target.created_at
  +',and(created_at.eq.'+target.created_at+',id.lte.'+target.id+'))';
 const newerCursor='(created_at.gt.'+target.created_at
  +',and(created_at.eq.'+target.created_at+',id.gte.'+target.id+'))';
 const older=new URLSearchParams({...base,or:olderCursor,order:'created_at.desc,id.desc',limit:'70'});
 const newer=new URLSearchParams({...base,or:newerCursor,order:'created_at.asc,id.asc',limit:'70'});
 const [before,after]=await Promise.all([getRows(token,older),getRows(token,newer)]);
 const map=new Map<string,GroupMessage>();
 for(const message of [...before,...after,target]){
  if(message.group_id===groupId)map.set(message.id,message);
 }
 return Array.from(map.values()).sort(compareGroupMessages);
}
