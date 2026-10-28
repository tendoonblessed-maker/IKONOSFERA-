import {apiUrl} from '@/lib/supabase-rest';
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
export type ActivityVisibility='exact'|'approximate';
export type UserActivity={user_id:string;status:string;last_seen_at:string|null};
async function activityApi<T>(token:string,path:string,method='GET',body?:unknown):Promise<T>{
 const res=await fetch(apiUrl+path,{method,headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 const data=await res.json().catch(()=>null);
 if(!res.ok)throw Error(data?.message||'Не удалось обновить статус активности');
 return data as T;
}
export async function pingActivity(token:string,visibility:ActivityVisibility|null=null):Promise<void>{
 await activityApi(token,'/rest/v1/rpc/set_my_activity','POST',{p_visibility:visibility});
}
export async function myActivityVisibility(token:string,userId:string):Promise<ActivityVisibility>{
 const rows=await activityApi<{visibility:ActivityVisibility}[]>(token,'/rest/v1/user_activity?select=visibility&user_id=eq.'+encodeURIComponent(userId)+'&limit=1');
 return rows[0]?.visibility==='exact'?'exact':'approximate';
}
export async function getUserActivities(token:string,ids:string[]):Promise<Record<string,UserActivity>>{
 const clean=Array.from(new Set(ids.filter(id=>/^[0-9a-f-]{36}$/i.test(id)))).slice(0,100);
 if(!clean.length)return {};
 const rows=await activityApi<UserActivity[]>(token,'/rest/v1/rpc/get_user_activity','POST',{p_user_ids:clean});
 return Object.fromEntries(rows.map(x=>[x.user_id,x]));
}
export function activityLabel(value:UserActivity|null|undefined):string{
 if(!value)return 'был давно';
 if(value.status==='в сети')return 'в сети';
 if(value.status!=='exact')return value.status||'был давно';
 const date=new Date(value.last_seen_at||'');
 if(!Number.isFinite(date.getTime()))return 'был давно';
 const today=new Date();
 const time=date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
 if(date.toDateString()===today.toDateString())return 'был сегодня в '+time;
 const yesterday=new Date(today.getFullYear(),today.getMonth(),today.getDate()-1);
 if(date.toDateString()===yesterday.toDateString())return 'был вчера в '+time;
 return 'был '+date.toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'})+' в '+time;
}
