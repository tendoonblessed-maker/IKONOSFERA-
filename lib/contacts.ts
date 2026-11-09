/* Per-account saved contacts and blocklist.
   Storage is in Supabase under owner-only row-level security (never localStorage). */
import {apiUrl} from "@/lib/supabase-rest";
import {collectPostgrestPages} from "@/lib/postgrest-pagination.mjs";

const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??"";
const CONTACT_PAGE_SIZE=100;
type ContactRow={contact_id:string};
type BlockRow={blocked_id:string};

async function request<T>(path:string,token:string,method:"GET"|"POST"|"DELETE"="GET",body?:unknown):Promise<T>{
 if(!apiUrl||!publishableKey||!token)throw Error("Требуется подключение к аккаунту.");
 const response=await fetch(apiUrl+path,{
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

/** Read one bounded PostgREST page and retain its total-count metadata. */
async function requestPage<T>(
 path:string,token:string,offset:number,limit:number
):Promise<{rows:T[];contentRange:string|null}>{
 if(!apiUrl||!publishableKey||!token)throw Error("Требуется подключение к аккаунту.");
 const response=await fetch(apiUrl+path,{
  method:"GET",
  headers:{
   apikey:publishableKey,Authorization:"Bearer "+token,
   "Content-Type":"application/json",
   "Range-Unit":"items",
   Range:`${offset}-${offset+limit-1}`,
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

async function listAllRows<T>(path:string,token:string):Promise<T[]>{
 return collectPostgrestPages<T>(
  (offset,limit)=>requestPage<T>(path,token,offset,limit),
  {pageSize:CONTACT_PAGE_SIZE,maxPages:1000}
 );
}

export async function listSavedContacts(token:string,ownerId:string):Promise<string[]>{
 const rows=await listAllRows<ContactRow>(
  "/rest/v1/user_contacts?select=contact_id&owner_id=eq."+encodeURIComponent(ownerId)+"&order=created_at.desc,contact_id.asc",
  token
 );
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
 const rows=await listAllRows<BlockRow>(
  "/rest/v1/user_blocks?select=blocked_id&owner_id=eq."+encodeURIComponent(ownerId)+"&order=created_at.desc,blocked_id.asc",
  token
 );
 return [...new Set(rows.map(row=>row.blocked_id))];
}
export async function addBlockedUser(token:string,ownerId:string,blockedId:string):Promise<void>{
 if(ownerId===blockedId)throw Error("Нельзя заблокировать себя.");
 await request<void>("/rest/v1/user_blocks",token,"POST",{owner_id:ownerId,blocked_id:blockedId});
}
export async function removeBlockedUser(token:string,ownerId:string,blockedId:string):Promise<void>{
 await request<void>("/rest/v1/user_blocks?owner_id=eq."+encodeURIComponent(ownerId)+"&blocked_id=eq."+encodeURIComponent(blockedId),token,"DELETE");
}
