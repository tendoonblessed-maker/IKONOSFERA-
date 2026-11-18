/* Per-account saved contacts and blocklist.
   Storage is in Supabase under owner-only row-level security (never localStorage). */
import {apiUrl} from "@/lib/supabase-rest";

const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??"";
type ContactRow={contact_id:string};
type BlockRow={blocked_id:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate and canonicalize IDs before they become PostgREST filter/body values. */
function normalizeUserId(value:unknown):string{
 if(typeof value!=="string"||!UUID.test(value.trim()))
  throw Error("Некорректный идентификатор пользователя.");
 return value.trim().toLowerCase();
}
/** Treat malformed server rows as absent instead of exposing them to the UI. */
function normalizeIdList(rows:unknown,column:"contact_id"|"blocked_id"):string[]{
 if(!Array.isArray(rows))return [];
 const ids=new Set<string>();
 for(const row of rows){
  if(!row||typeof row!=="object"||Array.isArray(row))continue;
  try{ids.add(normalizeUserId((row as Record<string,unknown>)[column]));}
  catch{/* Ignore malformed rows in read-only lists. */}
 }
 return [...ids];
}

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

export async function listSavedContacts(token:string,ownerId:string):Promise<string[]>{
 const owner=normalizeUserId(ownerId);
 const rows=await request<unknown>("/rest/v1/user_contacts?select=contact_id&owner_id=eq."+encodeURIComponent(owner)+"&order=created_at.desc&limit=500",token);
 return normalizeIdList(rows,"contact_id");
}
export async function addSavedContact(token:string,ownerId:string,contactId:string):Promise<void>{
 const owner=normalizeUserId(ownerId),contact=normalizeUserId(contactId);
 if(owner===contact)throw Error("Нельзя добавить себя в контакты.");
 await request<void>("/rest/v1/user_contacts",token,"POST",{owner_id:owner,contact_id:contact});
}
export async function removeSavedContact(token:string,ownerId:string,contactId:string):Promise<void>{
 const owner=normalizeUserId(ownerId),contact=normalizeUserId(contactId);
 await request<void>("/rest/v1/user_contacts?owner_id=eq."+encodeURIComponent(owner)+"&contact_id=eq."+encodeURIComponent(contact),token,"DELETE");
}
export async function listBlockedUsers(token:string,ownerId:string):Promise<string[]>{
 const owner=normalizeUserId(ownerId);
 const rows=await request<unknown>("/rest/v1/user_blocks?select=blocked_id&owner_id=eq."+encodeURIComponent(owner)+"&order=created_at.desc&limit=500",token);
 return normalizeIdList(rows,"blocked_id");
}
export async function addBlockedUser(token:string,ownerId:string,blockedId:string):Promise<void>{
 const owner=normalizeUserId(ownerId),blocked=normalizeUserId(blockedId);
 if(owner===blocked)throw Error("Нельзя заблокировать себя.");
 await request<void>("/rest/v1/user_blocks",token,"POST",{owner_id:owner,blocked_id:blocked});
}
export async function removeBlockedUser(token:string,ownerId:string,blockedId:string):Promise<void>{
 const owner=normalizeUserId(ownerId),blocked=normalizeUserId(blockedId);
 await request<void>("/rest/v1/user_blocks?owner_id=eq."+encodeURIComponent(owner)+"&blocked_id=eq."+encodeURIComponent(blocked),token,"DELETE");
}
