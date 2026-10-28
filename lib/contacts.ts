/* Per-account saved contacts and blocklist.
   Storage is in Supabase under owner-only row-level security (never localStorage). */
import {apiUrl} from "@/lib/supabase-rest";

const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??"";
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

export async function listSavedContacts(token:string,ownerId:string):Promise<string[]>{
 const rows=await request<ContactRow[]>("/rest/v1/user_contacts?select=contact_id&owner_id=eq."+encodeURIComponent(ownerId)+"&order=created_at.desc&limit=500",token);
 return rows.map(row=>row.contact_id);
}
export async function addSavedContact(token:string,ownerId:string,contactId:string):Promise<void>{
 if(ownerId===contactId)throw Error("Нельзя добавить себя в контакты.");
 await request<void>("/rest/v1/user_contacts",token,"POST",{owner_id:ownerId,contact_id:contactId});
}
export async function removeSavedContact(token:string,ownerId:string,contactId:string):Promise<void>{
 await request<void>("/rest/v1/user_contacts?owner_id=eq."+encodeURIComponent(ownerId)+"&contact_id=eq."+encodeURIComponent(contactId),token,"DELETE");
}
export async function listBlockedUsers(token:string,ownerId:string):Promise<string[]>{
 const rows=await request<BlockRow[]>("/rest/v1/user_blocks?select=blocked_id&owner_id=eq."+encodeURIComponent(ownerId)+"&order=created_at.desc&limit=500",token);
 return rows.map(row=>row.blocked_id);
}
export async function addBlockedUser(token:string,ownerId:string,blockedId:string):Promise<void>{
 if(ownerId===blockedId)throw Error("Нельзя заблокировать себя.");
 await request<void>("/rest/v1/user_blocks",token,"POST",{owner_id:ownerId,blocked_id:blockedId});
}
export async function removeBlockedUser(token:string,ownerId:string,blockedId:string):Promise<void>{
 await request<void>("/rest/v1/user_blocks?owner_id=eq."+encodeURIComponent(ownerId)+"&blocked_id=eq."+encodeURIComponent(blockedId),token,"DELETE");
}
