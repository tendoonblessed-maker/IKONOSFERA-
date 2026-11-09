/* Per-account saved contacts and blocklist.
   Storage is in Supabase under owner-only row-level security (never localStorage). */
import {apiUrl} from "@/lib/supabase-rest";
import {
 buildPostgrestCursorFilter,
 collectPostgrestKeysetPages
} from "@/lib/postgrest-pagination.mjs";

const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??"";
const CONTACT_PAGE_SIZE=100;
const CONTACT_REQUEST_TIMEOUT_MS=18000;
type ContactRow={contact_id:string;created_at:string};
type BlockRow={blocked_id:string;created_at:string};
type CursorRow={created_at:string;contact_id?:string;blocked_id?:string};
type IdColumn="contact_id"|"blocked_id";
type TableName="user_contacts"|"user_blocks";

/**
 * Bound every contact request on mobile networks. A timed-out mutation is
 * reported but never retried automatically because its server outcome may be
 * unknown; add/delete operations remain safe for an explicit user retry.
 */
async function fetchContactsWithTimeout(input:RequestInfo|URL,init:RequestInit):Promise<Response>{
 const controller=new AbortController();
 const timeoutId=setTimeout(()=>controller.abort(),CONTACT_REQUEST_TIMEOUT_MS);
 try{
  return await fetch(input,{...init,signal:controller.signal});
 }catch(error){
  if(controller.signal.aborted)
   throw Error("Запрос контактов не завершился вовремя. Проверь подключение и повтори попытку.");
  throw error;
 }finally{
  clearTimeout(timeoutId);
 }
}

async function request<T>(path:string,token:string,method:"GET"|"POST"|"DELETE"="GET",body?:unknown):Promise<T>{
 if(!apiUrl||!publishableKey||!token)throw Error("Требуется подключение к аккаунту.");
 const response=await fetchContactsWithTimeout(apiUrl+path,{
  method,
  headers:{
   apikey:publishableKey,Authorization:"Bearer "+token,
   "Content-Type":"application/json",
   ...(method==="POST"?{Prefer:"resolution=ignore-duplicates,return=minimal"}:{})
  },
  body:body===undefined?undefined:JSON.stringify(body),
  cache:"no-store"
 });
 if(!response.ok){
  const value=await response.json().catch(()=>null) as {message?:string;details?:string}|null;
  throw Error(value?.message||"Не удалось обновить контакты ("+response.status+").");
 }
 if(response.status===204||response.status===201||method!=="GET")return undefined as T;
 return response.json() as Promise<T>;
}

async function requestPage<T extends CursorRow>(
 table:TableName,
 idColumn:IdColumn,
 token:string,
 ownerId:string,
 cursor:{created_at:string;id:string}|null,
 limit:number
):Promise<{rows:T[];contentRange:string|null}>{
 if(!apiUrl||!publishableKey||!token)throw Error("Требуется подключение к аккаунту.");
 const params=new URLSearchParams({
  select:idColumn+",created_at",
  owner_id:"eq."+ownerId,
  order:"created_at.desc,"+idColumn+".asc",
  limit:String(limit)
 });
 const cursorFilter=buildPostgrestCursorFilter(cursor,idColumn);
 if(cursorFilter)params.set("or",cursorFilter);

 const response=await fetchContactsWithTimeout(apiUrl+"/rest/v1/"+table+"?"+params.toString(),{
  method:"GET",
  headers:{
   apikey:publishableKey,Authorization:"Bearer "+token,
   "Content-Type":"application/json",
   Prefer:"count=exact"
  },
  cache:"no-store"
 });
 if(!response.ok){
  const value=await response.json().catch(()=>null) as {message?:string}|null;
  throw Error(value?.message||"Не удалось загрузить контакты ("+response.status+").");
 }
 const rows=await response.json() as unknown;
 if(!Array.isArray(rows))throw Error("Сервер вернул некорректный список контактов.");
 return {rows:rows as T[],contentRange:response.headers.get("content-range")};
}

async function listAllRows<T extends CursorRow>(
 table:TableName,
 idColumn:IdColumn,
 token:string,
 ownerId:string
):Promise<T[]>{
 return collectPostgrestKeysetPages<T>(
  (cursor,limit)=>requestPage<T>(table,idColumn,token,ownerId,cursor,limit),
  row=>{
   const id=idColumn==="contact_id"?row.contact_id:row.blocked_id;
   if(typeof id!=="string")throw Error("Сервер вернул запись контакта без идентификатора.");
   return {created_at:row.created_at,id};
  },
  {pageSize:CONTACT_PAGE_SIZE,maxPages:1000}
 );
}

export async function listSavedContacts(token:string,ownerId:string):Promise<string[]>{
 const rows=await listAllRows<ContactRow>("user_contacts","contact_id",token,ownerId);
 return [...new Set(rows.map(row=>row.contact_id))];
}
export async function addSavedContact(token:string,ownerId:string,contactId:string):Promise<void>{
 if(ownerId===contactId)throw Error("Нельзя добавить себя в контакты.");
 await request<void>("/rest/v1/user_contacts",token,"POST",{owner_id:ownerId,contact_id:contactId});
}
export async function removeSavedContact(token:string,ownerId:string,contactId:string):Promise<void>{
 await request<void>("/rest/v1/user_contacts?owner_id=eq."+encodeURIComponent(ownerId)+"&contact_id=eq."+encodeURIComponent(contactId),token,"DELETE");
}
export async function listBlockedUsers(token:string,ownerId:string):Promise<string[]>{
 const rows=await listAllRows<BlockRow>("user_blocks","blocked_id",token,ownerId);
 return [...new Set(rows.map(row=>row.blocked_id))];
}
export async function addBlockedUser(token:string,ownerId:string,blockedId:string):Promise<void>{
 if(ownerId===blockedId)throw Error("Нельзя заблокировать себя.");
 await request<void>("/rest/v1/user_blocks",token,"POST",{owner_id:ownerId,blocked_id:blockedId});
}
export async function removeBlockedUser(token:string,ownerId:string,blockedId:string):Promise<void>{
 await request<void>("/rest/v1/user_blocks?owner_id=eq."+encodeURIComponent(ownerId)+"&blocked_id=eq."+encodeURIComponent(blockedId),token,"DELETE");
}
