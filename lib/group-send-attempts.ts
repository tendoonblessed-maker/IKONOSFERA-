/**
 * A group send's UUID is persisted in this browser tab until a canonical
 * database acknowledgment is observed. If the response is lost, a manual
 * retry uses the exact same primary key and cannot INSERT a second row.
 *
 * This is distinct from the text draft: the attempt represents a specific
 * submitted body, not a mutable text area. A different body gets a new UUID.
 * No messages or tokens are sent to a remote storage service.
 */
const PREFIX='ikonosfera-group-send-v1:';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const GROUP_SEND_ATTEMPT_TTL_MS=48*60*60*1000;
export type GroupSendAttempt={id:string;body:string;createdAt:number};
const inMemory=new Map<string,GroupSendAttempt>();

type SecureCryptoSource={
 randomUUID?:()=>string;
 getRandomValues?:Crypto['getRandomValues'];
};

/**
 * Prefer the native UUID API, but retain compatibility with older secure
 * browser contexts that expose getRandomValues() without randomUUID().
 * Some partial implementations expose randomUUID() but throw or return an
 * invalid value; in that case use the cryptographic byte fallback as well.
 * Never fall back to Math.random: the ID is also the database idempotency key.
 */
export function createGroupSendAttemptId(source:SecureCryptoSource|undefined=globalThis.crypto):string{
 if(typeof source?.randomUUID==='function'){
  try{
   const nativeId=source.randomUUID();
   if(UUID.test(nativeId))return nativeId;
  }catch{
   // A partially implemented native API must not block a secure fallback.
  }
 }
 if(typeof source?.getRandomValues!=='function'){
  throw Error('Безопасная генерация идентификатора недоступна в этом браузере.');
 }
 const bytes=source.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&0x0f)|0x40; // UUID version 4
 bytes[8]=(bytes[8]&0x3f)|0x80; // RFC 4122 variant
 const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
 return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}

function storage():Storage|null{
 try{return typeof window==='undefined'?null:window.sessionStorage;}
 catch{return null;}
}
function key(owner:string,group:string){return PREFIX+owner+':'+group;}
function valid(value:unknown,now:number):value is GroupSendAttempt{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const a=value as Partial<GroupSendAttempt>;
 return typeof a.id==='string'&&UUID.test(a.id)
  &&typeof a.body==='string'&&a.body.length>0&&a.body.length<=4000
  &&a.body.trim()===a.body
  &&typeof a.createdAt==='number'&&Number.isFinite(a.createdAt)
  &&a.createdAt<=now+300_000&&a.createdAt>now-GROUP_SEND_ATTEMPT_TTL_MS;
}
export function readGroupSendAttempt(owner:string,group:string,now=Date.now()):GroupSendAttempt|null{
 if(!UUID.test(owner)||!UUID.test(group))return null;
 const k=key(owner,group);
 let candidate:unknown;
 try{
  const raw=storage()?.getItem(k);
  candidate=raw?JSON.parse(raw):inMemory.get(k);
 }catch{candidate=inMemory.get(k);}
 if(!valid(candidate,now)){
  inMemory.delete(k);
  try{storage()?.removeItem(k);}catch{}
  return null;
 }
 return candidate;
}
export function getOrCreateGroupSendAttempt(
 owner:string,group:string,body:string,now=Date.now()
):GroupSendAttempt{
 if(!UUID.test(owner)||!UUID.test(group)||!body.trim()||body.length>4000){
  throw Error('Некорректный черновик сообщения группы.');
 }
 const trimmed=body.trim();
 const prior=readGroupSendAttempt(owner,group,now);
 if(prior?.body===trimmed)return prior;
 const attempt:GroupSendAttempt={id:createGroupSendAttemptId(),body:trimmed,createdAt:now};
 const k=key(owner,group);
 inMemory.set(k,attempt);
 try{storage()?.setItem(k,JSON.stringify(attempt));}catch{}
 return attempt;
}
/** A late acknowledgment must not clear a different, newer attempt. */
export function clearGroupSendAttempt(owner:string,group:string,attemptId:string):void{
 if(!UUID.test(owner)||!UUID.test(group)||!UUID.test(attemptId))return;
 const current=readGroupSendAttempt(owner,group);
 if(current?.id!==attemptId)return;
 const k=key(owner,group);
 inMemory.delete(k);
 try{storage()?.removeItem(k);}catch{}
}
export function clearAllGroupSendAttempts(owner:string):void{
 if(!UUID.test(owner))return;
 const prefix=PREFIX+owner+':';
 for(const k of inMemory.keys())if(k.startsWith(prefix))inMemory.delete(k);
 try{
  const s=storage();
  if(!s)return;
  const targets:string[]=[];
  for(let i=0;i<s.length;i++){
   const k=s.key(i);
   if(k?.startsWith(prefix))targets.push(k);
  }
  for(const k of targets)s.removeItem(k);
 }catch{}
}
