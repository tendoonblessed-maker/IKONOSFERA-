/**
 * Stable identity for one direct text-message attempt.
 *
 * When Web Locks and localStorage are available, the fingerprint and UUID are
 * shared across tabs under an origin-wide lock. Older browsers keep the
 * sessionStorage/in-memory fallback, which is intentionally tab-local.
 *
 * Only a SHA-256 digest, UUID and timestamp are persisted; message text,
 * reply IDs and access tokens are never stored here.
 */
const PREFIX='ikonosfera-direct-text-attempt-v1:';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const FINGERPRINT=/^[a-f0-9]{64}$/i;
export const DIRECT_TEXT_ATTEMPT_TTL_MS=48*60*60*1000;
export const DIRECT_TEXT_MAX_ATTEMPTS_PER_CHAT=128;

export type DirectTextAttempt={fingerprint:string;id:string;createdAt:number};
type SharedLockManager={
 request<T>(name:string,options:{mode:'exclusive'},callback:(lock:unknown|null)=>T|Promise<T>):Promise<T>;
};
type SharedContext={locks:SharedLockManager;store:Storage};
const inMemory=new Map<string,DirectTextAttempt[]>();
const inFlight=new Map<string,Promise<string>>();

function sessionStorage():Storage|null{
 try{return typeof window==='undefined'?null:window.sessionStorage;}
 catch{return null;}
}
function sharedContext():SharedContext|null{
 try{
  if(typeof window==='undefined'||typeof navigator==='undefined')return null;
  const locks=navigator.locks;
  const store=window.localStorage;
  if(!locks||typeof locks.request!=='function'||!store)return null;
  return {locks:locks as unknown as SharedLockManager,store};
 }catch{return null;}
}
function key(ownerId:string,chatId:string):string{
 return PREFIX+ownerId+':'+chatId;
}
function memoryKey(storageKey:string,shared:boolean):string{
 return storageKey+(shared?':shared':':session');
}
function valid(value:unknown,now:number):value is DirectTextAttempt{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const item=value as Partial<DirectTextAttempt>;
 return typeof item.fingerprint==='string'&&FINGERPRINT.test(item.fingerprint)
  &&typeof item.id==='string'&&UUID.test(item.id)
  &&typeof item.createdAt==='number'&&Number.isFinite(item.createdAt)
  &&item.createdAt<=now+300_000
  &&item.createdAt>now-DIRECT_TEXT_ATTEMPT_TTL_MS;
}
function write(ownerId:string,chatId:string,records:DirectTextAttempt[],shared:boolean):boolean{
 const k=key(ownerId,chatId);
 inMemory.set(memoryKey(k,shared),records);
 try{
  const store=shared?sharedContext()?.store:sessionStorage();
  if(!store)return !shared;
  if(records.length)store.setItem(k,JSON.stringify(records));
  else store.removeItem(k);
  return true;
 }catch{return false;}
}
export function readDirectTextAttempts(
 ownerId:string,chatId:string,now=Date.now(),shared=Boolean(sharedContext())
):DirectTextAttempt[]{
 if(!UUID.test(ownerId)||!UUID.test(chatId))return [];
 const k=key(ownerId,chatId),mk=memoryKey(k,shared);
 let value:unknown;
 try{
  const store=shared?sharedContext()?.store:sessionStorage();
  if(shared&&!store)throw Error('Shared attempt storage is unavailable.');
  const raw=store?.getItem(k);
  value=raw!=null?JSON.parse(raw):(shared?[]:inMemory.get(mk));
 }catch{
  if(shared)throw Error('Не удалось безопасно прочитать попытку отправки между вкладками.');
  value=inMemory.get(mk);
 }
 const records=Array.isArray(value)?value.filter((item):item is DirectTextAttempt=>valid(item,now)): [];
 if(!Array.isArray(value)||records.length!==value.length)write(ownerId,chatId,records,shared);
 return records;
}
function hex(bytes:ArrayBuffer):string{
 return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function fingerprintText(
 ownerId:string,chatId:string,body:string,replyToMessageId:string|null
):Promise<string>{
 if(typeof crypto==='undefined'||!crypto.subtle||typeof TextEncoder==='undefined')
  throw Error('Безопасное восстановление отправки недоступно в этом браузере.');
 const input=new TextEncoder().encode(JSON.stringify({
  ownerId,chatId,body:body.trim(),replyToMessageId
 }));
 return hex(await crypto.subtle.digest('SHA-256',input));
}
function createAttempt(
 ownerId:string,chatId:string,fingerprint:string,createId:()=>string,now:number,shared:boolean
):string{
 const records=readDirectTextAttempts(ownerId,chatId,now,shared);
 const existing=records.find(item=>item.fingerprint===fingerprint);
 if(existing)return existing.id;
 if(records.length>=DIRECT_TEXT_MAX_ATTEMPTS_PER_CHAT)
  throw Error('Слишком много неподтверждённых сообщений. Повтори отправку прежних черновиков.');
 const id=createId();
 if(!UUID.test(id))throw Error('Не удалось безопасно создать ID отправки.');
 const next=[{fingerprint,id,createdAt:now},...records];
 if(!write(ownerId,chatId,next,shared)&&shared)
  throw Error('Не удалось сохранить безопасную попытку между вкладками. Сообщение не отправлено.');
 return id;
}
export async function getOrCreateDirectTextAttempt(
 ownerId:string,chatId:string,body:string,replyToMessageId:string|null,
 createId:()=>string,now=Date.now()
):Promise<string>{
 const trimmed=typeof body==='string'?body.trim():'';
 if(!UUID.test(ownerId)||!UUID.test(chatId)||!trimmed||trimmed.length>4000
  ||(replyToMessageId!==null&&!UUID.test(replyToMessageId))
  ||typeof createId!=='function')
  throw Error('Некорректные параметры личного сообщения.');
 const fingerprint=await fingerprintText(ownerId,chatId,trimmed,replyToMessageId);
 const attemptKey=key(ownerId,chatId)+':'+fingerprint;
 const pending=inFlight.get(attemptKey);
 if(pending)return pending;
 const context=sharedContext();
 const creation=context
  ?context.locks.request(PREFIX+'lock:'+key(ownerId,chatId),{mode:'exclusive'},lock=>{
    if(!lock)throw Error('Не удалось получить блокировку попытки отправки.');
    return Promise.resolve(createAttempt(ownerId,chatId,fingerprint,createId,now,true));
   })
  :Promise.resolve(createAttempt(ownerId,chatId,fingerprint,createId,now,false));
 inFlight.set(attemptKey,creation);
 try{return await creation;}
 finally{if(inFlight.get(attemptKey)===creation)inFlight.delete(attemptKey);}
}
/** A late acknowledgment can clear only its own pending attempt. */
export async function clearDirectTextAttempt(ownerId:string,chatId:string,id:string):Promise<void>{
 if(!UUID.test(ownerId)||!UUID.test(chatId)||!UUID.test(id))return;
 const context=sharedContext();
 if(context){
  try{
   await context.locks.request(PREFIX+'lock:'+key(ownerId,chatId),{mode:'exclusive'},lock=>{
    if(!lock)return;
    const records=readDirectTextAttempts(ownerId,chatId,Date.now(),true);
    if(records.some(item=>item.id===id))
     write(ownerId,chatId,records.filter(item=>item.id!==id),true);
   });
  }catch{/* Confirmed sends must not become UI failures because cleanup failed. */}
  return;
 }
 const records=readDirectTextAttempts(ownerId,chatId);
 if(records.some(item=>item.id===id))
  write(ownerId,chatId,records.filter(item=>item.id!==id),false);
}
