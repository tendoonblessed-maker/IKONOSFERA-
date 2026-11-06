import {apiUrl} from './supabase-rest';
import type {GroupMessage} from './groups';

const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??'';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const GROUP_SEARCH_PAGE_SIZE=24;
export const GROUP_SEARCH_MAX_OFFSET=480;
const GROUP_SEARCH_TIMEOUT_MS=18000;
const MESSAGE_FIELDS='id,group_id,sender_id,body,created_at';

export function normalizeGroupSearch(query:string):string{
 return query.trim().replace(/\s+/g,' ').slice(0,120);
}

export function buildGroupSearchPath(groupId:string,query:string,offset:number):string{
 if(!UUID.test(groupId))throw Error('Некорректная группа');
 const term=normalizeGroupSearch(query);
 if(term.length<2||offset<0||offset>GROUP_SEARCH_MAX_OFFSET||
    !Number.isSafeInteger(offset)||offset%GROUP_SEARCH_PAGE_SIZE!==0)
  throw Error('Введите не меньше двух символов для поиска.');
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

/** Forward cancellation from the UI while preserving the bounded timeout. */
function createRequestSignal(external?:AbortSignal){
 const controller=new AbortController();
 const timeout=AbortSignal.timeout(GROUP_SEARCH_TIMEOUT_MS);
 const abortFromTimeout=()=>controller.abort(timeout.reason);
 const abortFromCaller=()=>controller.abort(external?.reason);
 if(timeout.aborted)abortFromTimeout();
 else timeout.addEventListener('abort',abortFromTimeout,{once:true});
 if(external?.aborted)abortFromCaller();
 else external?.addEventListener('abort',abortFromCaller,{once:true});
 return {
  signal:controller.signal,
  dispose(){
   timeout.removeEventListener('abort',abortFromTimeout);
   external?.removeEventListener('abort',abortFromCaller);
  }
 };
}

async function getRows(token:string,params:URLSearchParams,signal?:AbortSignal):Promise<GroupMessage[]>{
 const request=createRequestSignal(signal);
 try{
  const response=await fetch(apiUrl+'/rest/v1/group_messages?'+params,{
   method:'GET',
   headers:{apikey:anonKey,Authorization:'Bearer '+token},
   cache:'no-store',signal:request.signal
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok||!Array.isArray(data))
   throw Error('Не удалось загрузить историю группы. Проверь соединение.');
  return data as GroupMessage[];
 }finally{request.dispose();}
}

export async function searchGroupMessages(
 token:string,groupId:string,query:string,offset:number,signal?:AbortSignal
):Promise<GroupMessage[]>{
 const path=buildGroupSearchPath(groupId,query,offset);
 const request=createRequestSignal(signal);
 try{
  const res=await fetch(apiUrl+path,{
   method:'GET',
   headers:{apikey:anonKey,Authorization:'Bearer '+token},
   cache:'no-store',signal:request.signal
  });
  const data=await res.json().catch(()=>null);
  if(!res.ok||!Array.isArray(data))throw Error('Не удалось выполнить поиск по группе.');
  return data as GroupMessage[];
 }finally{request.dispose();}
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
 const base={select:MESSAGE_FIELDS,group_id:'eq.'+groupId};
 const exact=new URLSearchParams({...base,id:'eq.'+targetId,limit:'1'});
 const target=(await getRows(token,exact,signal))[0];
 if(!target||target.id!==targetId||target.group_id!==groupId)
  throw Error('Сообщение удалено или больше недоступно.');
 const older=new URLSearchParams({...base,created_at:'lte.'+target.created_at,order:'created_at.desc,id.desc',limit:'70'});
 const newer=new URLSearchParams({...base,created_at:'gte.'+target.created_at,order:'created_at.asc,id.asc',limit:'70'});
 const [before,after]=await Promise.all([getRows(token,older,signal),getRows(token,newer,signal)]);
 const map=new Map<string,GroupMessage>();
 for(const message of [...before,...after,target]){
  if(message.group_id===groupId)map.set(message.id,message);
 }
 return Array.from(map.values()).sort((a,b)=>
  Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id));
}
