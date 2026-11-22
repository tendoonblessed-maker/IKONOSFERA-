import {apiUrl} from '@/lib/supabase-rest';
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
export type Group={id:string;owner_id:string;title:string;created_at:string};
export type GroupMessage={id:string;group_id:string;sender_id:string;body:string;created_at:string};
export type GroupOverview={group_id:string;last_body:string|null;last_created_at:string|null;unread_count:number;member_count:number};
async function request<T>(
 token:string,path:string,method='GET',body?:unknown,
 extraHeaders:Record<string,string>={},signal?:AbortSignal
):Promise<T>{
 const res=await fetch(apiUrl+path,{method,headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json',...(method==='POST'?{Prefer:'return=representation'}:{}),...extraHeaders},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:signal??(method==='GET'?AbortSignal.timeout(18000):undefined)});
 const data=await res.json().catch(()=>null);if(!res.ok)throw Error(data?.message||'Ошибка группы');return data as T;
}
export async function createGroup(token:string,title:string,ids:string[]){return request<string>(token,'/rest/v1/rpc/create_group_chat','POST',{p_title:title,p_members:ids});}
export async function listGroups(token:string){return request<Group[]>(token,'/rest/v1/group_chats?select=*&order=created_at.desc&limit=100');}
export async function groupMembers(token:string,id:string){return request<{group_id:string;user_id:string}[]>(token,'/rest/v1/group_members?select=group_id,user_id&group_id=eq.'+encodeURIComponent(id));}

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const GROUP_MESSAGE_TIMESTAMP=/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?(?:Z|[+-]\\d{2}:\\d{2})$/;
export const GROUP_LATEST_PAGE_SIZE=150;

/** Validate the newest group snapshot before it reaches rendering or read tracking. */
export function normalizeGroupMessagePage(data:unknown,groupId:string):GroupMessage[]{
 if(!UUID.test(groupId)||!Array.isArray(data)||data.length>GROUP_LATEST_PAGE_SIZE)
  throw Error('Некорректные данные истории группы.');
 const rows:GroupMessage[]=[];
 const seen=new Set<string>();
 for(const value of data){
  if(!value||typeof value!=='object'||Array.isArray(value))
   throw Error('Некорректные данные истории группы.');
  const row=value as Record<string,unknown>;
  if(typeof row.id!=='string'||!UUID.test(row.id)
   ||typeof row.group_id!=='string'||row.group_id!==groupId
   ||typeof row.sender_id!=='string'||!UUID.test(row.sender_id)
   ||typeof row.body!=='string'
   ||typeof row.created_at!=='string'||!GROUP_MESSAGE_TIMESTAMP.test(row.created_at)
   ||!Number.isFinite(Date.parse(row.created_at)))
   throw Error('Некорректные данные истории группы.');
  const messageId=row.id.toLowerCase();
  if(seen.has(messageId))throw Error('Некорректные данные истории группы.');
  seen.add(messageId);
  rows.push(value as GroupMessage);
 }
 return rows;
}

export async function groupMessages(token:string,id:string){
 // Fetch the newest page, validate the complete snapshot, then display it chronologically.
 const latest=await request<unknown>(token,'/rest/v1/group_messages?select=*&group_id=eq.'+encodeURIComponent(id)+'&order=created_at.desc,id.desc&limit='+GROUP_LATEST_PAGE_SIZE);
 return normalizeGroupMessagePage(latest,id).reverse();
}
function assertGroupMessage(row:GroupMessage|undefined,groupId:string,userId:string,body:string,messageId:string):GroupMessage{
 if(!row||row.id!==messageId||row.group_id!==groupId||row.sender_id!==userId||row.body!==body)
  throw Error('Не удалось подтвердить отправку именно этого сообщения.');
 return row;
}
async function readGroupSendResult(token:string,groupId:string,userId:string,messageId:string):Promise<GroupMessage|undefined>{
 // SELECT obeys the existing group-member RLS; a revoked user cannot
 // recover or read messages from a group they no longer belong to.
 const url='/rest/v1/group_messages?select=*&id=eq.'+encodeURIComponent(messageId)
  +'&group_id=eq.'+encodeURIComponent(groupId)
  +'&sender_id=eq.'+encodeURIComponent(userId)+'&limit=1';
 return (await request<GroupMessage[]>(token,url))[0];
}
/** Idempotent group send.
 * The database's existing UUID primary key prevents duplicates. POST uses
 * INSERT+ON CONFLICT DO NOTHING, never UPDATE, and preserves INSERT RLS.
 * The caller must keep the same messageId when manually retrying the same
 * body after an ambiguous network timeout.
 */
export async function sendGroupMessage(
 token:string,id:string,userId:string,body:string,messageId:string
):Promise<GroupMessage>{
 const trimmed=body.trim();
 if(!UUID.test(id)||!UUID.test(userId)||!UUID.test(messageId)||!trimmed||trimmed.length>4000)
  throw Error('Неверные параметры сообщения группы.');
 const path='/rest/v1/group_messages?on_conflict=id';
 let postError:unknown=null;
 try{
  const rows=await request<GroupMessage[]>(token,path,'POST',{
   id:messageId,group_id:id,sender_id:userId,body:trimmed
  },{Prefer:'resolution=ignore-duplicates,return=representation'},AbortSignal.timeout(18000));
  if(rows[0])return assertGroupMessage(rows[0],id,userId,trimmed,messageId);
  // On an existing id PostgREST returns [], so fetch its canonical row.
 }catch(error){postError=error;}
 try{
  const existing=await readGroupSendResult(token,id,userId,messageId);
  if(existing)return assertGroupMessage(existing,id,userId,trimmed,messageId);
 }catch(error){
  // Do not mask a verification mismatch (an unexpected ID collision).
  if(error instanceof Error&&error.message.includes('именно этого сообщения'))throw error;
 }
 if(postError instanceof Error&&/Неверные параметры|именно этого сообщения/.test(postError.message))throw postError;
 // POST may have committed despite a network timeout. Leave the exact
 // client UUID attached to the local draft for a safe *manual* retry.
 throw Error('Не удалось подтвердить отправку. Проверь сеть и попробуй ещё раз с тем же черновиком.');
}

export async function listGroupOverviews(token:string):Promise<GroupOverview[]>{
 return request<GroupOverview[]>(token,'/rest/v1/rpc/list_group_overviews','POST',{});
}
export async function markGroupRead(token:string,id:string):Promise<void>{
 await request(token,'/rest/v1/rpc/mark_group_read','POST',{p_group_id:id});
}
