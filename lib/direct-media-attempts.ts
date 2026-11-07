/**
 * Stable identity for one private media send in the current browser tab.
 *
 * The fingerprint includes file bytes and the exact caption, so selecting the
 * same file again after a lost response reuses its client_message_id. Only a
 * digest and UUID are persisted; file bytes, captions and auth tokens are not.
 */
const PREFIX='ikonosfera-direct-media-attempt-v1:';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const FINGERPRINT=/^[a-f0-9]{64}$/i;
export const DIRECT_MEDIA_ATTEMPT_TTL_MS=48*60*60*1000;
const MAX_ATTEMPTS_PER_CHAT=128;
const MAX_MEDIA_BYTES=25*1024*1024;

export type DirectMediaAttempt={fingerprint:string;id:string;createdAt:number};
const inMemory=new Map<string,DirectMediaAttempt[]>();
const inFlight=new Map<string,Promise<string>>();

function storage():Storage|null{
  try{return typeof window==='undefined'?null:window.sessionStorage;}
  catch{return null;}
}
function key(ownerId:string,chatId:string):string{
  return PREFIX+ownerId+':'+chatId;
}
function valid(value:unknown,now:number):value is DirectMediaAttempt{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const item=value as Partial<DirectMediaAttempt>;
  return typeof item.fingerprint==='string'&&FINGERPRINT.test(item.fingerprint)
    &&typeof item.id==='string'&&UUID.test(item.id)
    &&typeof item.createdAt==='number'&&Number.isFinite(item.createdAt)
    &&item.createdAt<=now+300000
    &&item.createdAt>now-DIRECT_MEDIA_ATTEMPT_TTL_MS;
}
function write(ownerId:string,chatId:string,records:DirectMediaAttempt[]):void{
  const k=key(ownerId,chatId);
  inMemory.set(k,records);
  try{
    const s=storage();
    if(!s)return;
    if(records.length)s.setItem(k,JSON.stringify(records));
    else s.removeItem(k);
  }catch{/* Keep the bounded in-memory fallback for this tab. */}
}
export function readDirectMediaAttempts(
  ownerId:string,chatId:string,now=Date.now()
):DirectMediaAttempt[]{
  if(!UUID.test(ownerId)||!UUID.test(chatId))return [];
  const k=key(ownerId,chatId);
  let value:unknown;
  try{
    const raw=storage()?.getItem(k);
    value=raw?JSON.parse(raw):inMemory.get(k);
  }catch{value=inMemory.get(k);}
  const records=Array.isArray(value)?value.filter((item):item is DirectMediaAttempt=>valid(item,now)):[];
  if(!Array.isArray(value)||records.length!==value.length)write(ownerId,chatId,records);
  return records;
}
function hex(bytes:ArrayBuffer):string{
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function fingerprintFile(
  file:Pick<File,'type'|'size'|'name'|'lastModified'|'arrayBuffer'>,caption:string
):Promise<string>{
  if(typeof crypto==='undefined'||!crypto.subtle)
    throw Error('Безопасное восстановление вложения недоступно в этом браузере.');
  const bytes=await file.arrayBuffer();
  const contentHash=hex(await crypto.subtle.digest('SHA-256',bytes));
  const metadata=new TextEncoder().encode(JSON.stringify({
    contentHash,type:file.type,size:file.size,name:file.name,
    lastModified:file.lastModified,caption:caption.trim().slice(0,4000)
  }));
  return hex(await crypto.subtle.digest('SHA-256',metadata));
}
export async function getOrCreateDirectMediaAttempt(
  ownerId:string,chatId:string,file:Pick<File,'type'|'size'|'name'|'lastModified'|'arrayBuffer'>,
  caption='',now=Date.now()
):Promise<string>{
  if(!UUID.test(ownerId)||!UUID.test(chatId)||!file
    ||!Number.isFinite(file.size)||file.size<=0||file.size>MAX_MEDIA_BYTES
    ||typeof file.type!=='string'||!file.type
    ||typeof file.name!=='string'||typeof file.arrayBuffer!=='function'
    ||typeof caption!=='string')
    throw Error('Некорректные параметры вложения.');
  const fingerprint=await fingerprintFile(file,caption);
  const attemptKey=key(ownerId,chatId)+':'+fingerprint;
  const pending=inFlight.get(attemptKey);
  if(pending)return pending;
  const creation=(async()=>{
    const records=readDirectMediaAttempts(ownerId,chatId,now);
    const existing=records.find(item=>item.fingerprint===fingerprint);
    if(existing)return existing.id;
    if(records.length>=MAX_ATTEMPTS_PER_CHAT)
      throw Error('Слишком много неподтверждённых вложений. Сначала повтори отправку прежних файлов.');
    const attempt={fingerprint,id:crypto.randomUUID(),createdAt:now};
    write(ownerId,chatId,[attempt,...records]);
    return attempt.id;
  })();
  inFlight.set(attemptKey,creation);
  try{return await creation;}
  finally{if(inFlight.get(attemptKey)===creation)inFlight.delete(attemptKey);}
}
/** Acknowledging an older attempt cannot erase another pending attachment. */
export function clearDirectMediaAttempt(ownerId:string,chatId:string,id:string):void{
  if(!UUID.test(ownerId)||!UUID.test(chatId)||!UUID.test(id))return;
  const records=readDirectMediaAttempts(ownerId,chatId);
  if(!records.some(item=>item.id===id))return;
  write(ownerId,chatId,records.filter(item=>item.id!==id));
}
export function clearAllDirectMediaAttempts(ownerId:string):void{
  if(!UUID.test(ownerId))return;
  const prefix=PREFIX+ownerId+':';
  for(const k of inMemory.keys())if(k.startsWith(prefix))inMemory.delete(k);
  try{
    const s=storage();
    if(!s)return;
    const keys:string[]=[];
    for(let i=0;i<s.length;i++){
      const k=s.key(i);
      if(k?.startsWith(prefix))keys.push(k);
    }
    for(const k of keys)s.removeItem(k);
  }catch{/* Local sign-out must not depend on browser storage. */}
}
