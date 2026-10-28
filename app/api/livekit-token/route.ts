import {NextResponse} from 'next/server';
import {AccessToken} from 'livekit-server-sdk';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'no-store'};
function config(){
 const url=process.env.LIVEKIT_URL||process.env.NEXT_PUBLIC_LIVEKIT_URL||'';
 const key=process.env.LIVEKIT_API_KEY||'';
 const secret=process.env.LIVEKIT_API_SECRET||'';
 return {url,key,secret,ready:/^wss:\/\//.test(url)&&Boolean(key&&secret)};
}
const error=(message:string,status:number)=>NextResponse.json({error:message},{status,headers:noStore});
export function GET(){return NextResponse.json({enabled:config().ready},{headers:noStore});}
export async function POST(req:Request){
 const cfg=config();
 if(!cfg.ready)return error('Звонки временно недоступны: LiveKit не настроен',503);
 const auth=req.headers.get('authorization')||'';
 if(!auth.startsWith('Bearer ')||auth.length<25)return error('Необходим вход',401);
 const api=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/\/$/,'');
 const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
 if(!api||!anon)return error('Авторизация не настроена',503);
 const supaHeaders={apikey:anon,Authorization:auth};
 let input:unknown;
 try{input=await req.json();}catch{return error('Некорректный запрос',400);}
 if(!input||typeof input!=='object')return error('Некорректный запрос',400);
 const {kind,id}=input as {kind?:unknown;id?:unknown};
 if((kind!=='call'&&kind!=='voice')||typeof id!=='string'||!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id))return error('Некорректный идентификатор',400);
 try{
  const userRes=await fetch(api+'/auth/v1/user',{headers:supaHeaders,cache:'no-store'});
  if(!userRes.ok)return error('Сессия истекла',401);
  const user=await userRes.json() as {id?:string};
  if(!user.id)return error('Сессия истекла',401);
  if(kind==='call'){
   const res=await fetch(api+'/rest/v1/calls?select=id,chat_kind,chat_id,status,created_at&id=eq.'+encodeURIComponent(id),{headers:supaHeaders,cache:'no-store'});
   if(!res.ok)return error('Нет доступа к звонку',403);
   const calls=await res.json() as {id:string;status:string;created_at:string}[];
   if(!calls.length)return error('Нет доступа к звонку',403);
   if(calls[0].status==='ended')return error('Звонок завершён',410);
   if(calls[0].status==='ringing'&&Date.now()-Date.parse(calls[0].created_at)>45000)return error('Время ожидания истекло',410);
  }else{
   const res=await fetch(api+'/rest/v1/voice_channels?select=id,group_id&id=eq.'+encodeURIComponent(id),{headers:supaHeaders,cache:'no-store'});
   if(!res.ok||!(await res.json() as unknown[]).length)return error('Нет доступа к голосовому каналу',403);
  }
  const profileRes=await fetch(api+'/rest/v1/profiles?select=display_name&id=eq.'+encodeURIComponent(user.id),{headers:supaHeaders,cache:'no-store'});
  const profiles=profileRes.ok?await profileRes.json() as {display_name?:string}[]:[];
  const at=new AccessToken(cfg.key,cfg.secret,{identity:user.id,name:(profiles[0]?.display_name||'Участник').slice(0,60),ttl:'20m'});
  at.addGrant({room:kind+':'+id,roomJoin:true,canPublish:true,canSubscribe:true,canPublishData:false});
  const token=await at.toJwt();
  return NextResponse.json({token,url:cfg.url},{headers:noStore});
 }catch{
  return error('Ошибка подключения к серверу звонков',502);
 }
}
