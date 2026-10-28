import {apiUrl} from '@/lib/supabase-rest';
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
export type CallKind='direct'|'group';
export type Call={id:string;chat_kind:CallKind;chat_id:string;created_by:string;with_video:boolean;status:'ringing'|'active'|'ended';created_at:string};
export type CallInvite={call_id:string;status:string;created_at:string;calls:Call};
export type VoiceChannel={id:string;group_id:string;name:string;created_by:string;created_at:string};
async function callApi<T>(token:string,path:string,method='GET',data?:unknown):Promise<T>{
 if(!token||!apiUrl||!key)throw Error('Нет активной авторизации');
 const res=await fetch(apiUrl+path,{method,headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json',...(method==='POST'?{Prefer:'return=representation'}:{})},body:data===undefined?undefined:JSON.stringify(data),cache:'no-store'});
 const value=await res.json().catch(()=>null);
 if(!res.ok)throw Error(value?.message||value?.error||'Не удалось выполнить действие со звонком');
 return value as T;
}
export async function startMessengerCall(token:string,kind:CallKind,chatId:string,withVideo:boolean){
 return callApi<string>(token,'/rest/v1/rpc/start_messenger_call','POST',{p_chat_kind:kind,p_chat_id:chatId,p_with_video:withVideo});
}
export async function respondMessengerCall(token:string,id:string,accept:boolean){
 return callApi<void>(token,'/rest/v1/rpc/respond_messenger_call','POST',{p_call_id:id,p_accept:accept});
}
export async function endMessengerCall(token:string,id:string){
 return callApi<void>(token,'/rest/v1/rpc/end_messenger_call','POST',{p_call_id:id});
}
export async function listPendingCalls(token:string,userId:string){
 return callApi<CallInvite[]>(token,'/rest/v1/call_invites?select=call_id,status,created_at,calls!inner(id,chat_kind,chat_id,created_by,with_video,status,created_at)&user_id=eq.'+encodeURIComponent(userId)+'&status=eq.ringing&order=created_at.desc&limit=10');
}
export async function getCall(token:string,id:string){
 const data=await callApi<Call[]>(token,'/rest/v1/calls?select=*&id=eq.'+encodeURIComponent(id)+'&limit=1');
 return data[0]||null;
}
export async function listVoiceChannels(token:string,groupId:string){
 return callApi<VoiceChannel[]>(token,'/rest/v1/voice_channels?select=*&group_id=eq.'+encodeURIComponent(groupId)+'&order=created_at.asc');
}
export async function createVoiceChannel(token:string,groupId:string,userId:string,name:string){
 const n=name.trim();if(!n||n.length>60)throw Error('Название голосового канала: 1–60 символов');
 const rows=await callApi<VoiceChannel[]>(token,'/rest/v1/voice_channels?select=*','POST',{group_id:groupId,created_by:userId,name:n});
 if(!rows[0])throw Error('Голосовой канал не создан');return rows[0];
}
