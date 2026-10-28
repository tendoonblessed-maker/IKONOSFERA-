import {apiUrl} from '@/lib/supabase-rest';
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
export type Group={id:string;owner_id:string;title:string;created_at:string};
export type GroupMessage={id:string;group_id:string;sender_id:string;body:string;created_at:string};
export type GroupOverview={group_id:string;last_body:string|null;last_created_at:string|null;unread_count:number;member_count:number};
async function request<T>(token:string,path:string,method='GET',body?:unknown):Promise<T>{
 const res=await fetch(apiUrl+path,{method,headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json',...(method==='POST'?{Prefer:'return=representation'}:{})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 const data=await res.json().catch(()=>null);if(!res.ok)throw Error(data?.message||'Ошибка группы');return data as T;
}
export async function createGroup(token:string,title:string,ids:string[]){return request<string>(token,'/rest/v1/rpc/create_group_chat','POST',{p_title:title,p_members:ids});}
export async function listGroups(token:string){return request<Group[]>(token,'/rest/v1/group_chats?select=*&order=created_at.desc&limit=100');}
export async function groupMembers(token:string,id:string){return request<{group_id:string;user_id:string}[]>(token,'/rest/v1/group_members?select=group_id,user_id&group_id=eq.'+encodeURIComponent(id));}
export async function groupMessages(token:string,id:string){return request<GroupMessage[]>(token,'/rest/v1/group_messages?select=*&group_id=eq.'+encodeURIComponent(id)+'&order=created_at.asc&limit=150');}
export async function sendGroupMessage(token:string,id:string,userId:string,body:string){await request<GroupMessage[]>(token,'/rest/v1/group_messages','POST',{group_id:id,sender_id:userId,body:body.trim()});}

export async function listGroupOverviews(token:string):Promise<GroupOverview[]>{
 return request<GroupOverview[]>(token,'/rest/v1/rpc/list_group_overviews','POST',{});
}
export async function markGroupRead(token:string,id:string):Promise<void>{
 await request(token,'/rest/v1/rpc/mark_group_read','POST',{p_group_id:id});
}
