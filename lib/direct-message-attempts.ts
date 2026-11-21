/**
 * Stable identity for one direct text-message attempt in the current browser
 * tab. A retry after a lost acknowledgment must reuse client_message_id.
 *
 * Only a SHA-256 digest, UUID and timestamp are persisted in sessionStorage;
 * message text, reply IDs and access tokens are never stored here.
 */
const PREFIX='ikonosfera-direct-text-attempt-v1:';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const FINGERPRINT=/^[a-f0-9]{64}$/i;
export const DIRECT_TEXT_ATTEMPT_TTL_MS=48*60*60*1000;
export const DIRECT_TEXT_MAX_ATTEMPTS_PER_CHAT=128;

export type DirectTextAttempt={fingerprint:string;id:string;createdAt:number};
const inMemory=new Map<string,DirectTextAttempt[]>();
const inFlight=new Map<string,Promise<string>>();

function storage():Storage|null{
  try{return typeof window==='undefined'?null:window.sessionStorage;}
  catch{return null;}
}
function key(ownerId:string,chatId:string):string{
  return PREFIX+ownerId+':'+chatId;
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
function write(ownerId:string,chatId:string,records:DirectTextAttempt[]):void{
  const k=key(ownerId,chatId);
  inMemory.set(k,records);
  try{
    const s=storage();
    if(!s)return;
    if(records.length)s.setItem(k,JSON.stringify(records));
    else s.removeItem(k);
  }catch{/* Keep the bounded in-memory fallback for this tab. */}
}
export function readDirectTextAttempts(
  ownerId:string,chatId:string,now=Date.now()
):DirectTextAttempt[]{
  if(!UUID.test(ownerId)||!UUID.test(chatId))return [];
  const k=key(ownerId,chatId);
  let value:unknown;
  try{
    const raw=storage()?.getItem(k);
    value=raw?JSON.parse(raw):inMemory.get(k);
  }catch{value=inMemory.get(k);}
  const records=Array.isArray(value)?value.filter((item):item is DirectTextAttempt=>valid(item,now)):[];
  if(!Array.isArray(value)||records.length!==value.length)write(ownerId,chatId,records);
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
  const creation=(async()=>{
    const records=readDirectTextAttempts(ownerId,chatId,now);
    const existing=records.find(item=>item.fingerprint===fingerprint);
    if(existing)return existing.id;
    if(records.length>=DIRECT_TEXT_MAX_ATTEMPTS_PER_CHAT)
      throw Error('Слишком много неподтверждённых сообщений. Повтори отправку прежних черновиков.');
    const id=createId();
    if(!UUID.test(id))throw Error('Не удалось безопасно создать ID отправки.');
    write(ownerId,chatId,[{fingerprint,id,createdAt:now},...records]);
    return id;
  })();
  inFlight.set(attemptKey,creation);
  try{return await creation;}
  finally{if(inFlight.get(attemptKey)===creation)inFlight.delete(attemptKey);}
}
/** A late acknowledgment can clear only its own pending attempt. */
export function clearDirectTextAttempt(ownerId:string,chatId:string,id:string):void{
  if(!UUID.test(ownerId)||!UUID.test(chatId)||!UUID.test(id))return;
  const records=readDirectTextAttempts(ownerId,chatId);
  if(!records.some(item=>item.id===id))return;
  write(ownerId,chatId,records.filter(item=>item.id!==id));
}
