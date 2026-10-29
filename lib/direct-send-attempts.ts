/**
 * Idempotency identity for one direct-message draft within this browser tab.
 *
 * A failed POST may already be committed. Reuse its UUID for the exact same
 * body + optional reply target. Never automatically resend after reconnect.
 * No access tokens are stored; sessionStorage is per tab, account, and chat.
 */
const PREFIX='ikonosfera-direct-send-v1:';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const DIRECT_SEND_ATTEMPT_TTL_MS=48*60*60*1000;
export type DirectSendAttempt={
  id:string;body:string;replyId:string|null;createdAt:number;
};
const inMemory=new Map<string,DirectSendAttempt>();
function storage():Storage|null{
  try{return typeof window==='undefined'?null:window.sessionStorage;}
  catch{return null;}
}
function key(ownerId:string,chatId:string){return PREFIX+ownerId+':'+chatId;}
function valid(value:unknown,now:number):value is DirectSendAttempt{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const x=value as Partial<DirectSendAttempt>;
  return typeof x.id==='string'&&UUID.test(x.id)
    &&typeof x.body==='string'&&x.body.length>0&&x.body.length<=4000&&x.body.trim()===x.body
    &&(x.replyId===null||(typeof x.replyId==='string'&&UUID.test(x.replyId)))
    &&typeof x.createdAt==='number'&&Number.isFinite(x.createdAt)
    &&x.createdAt<=now+300000&&x.createdAt>now-DIRECT_SEND_ATTEMPT_TTL_MS;
}
export function readDirectSendAttempt(ownerId:string,chatId:string,now=Date.now()):DirectSendAttempt|null{
  if(!UUID.test(ownerId)||!UUID.test(chatId))return null;
  const k=key(ownerId,chatId);
  let value:unknown;
  try{const raw=storage()?.getItem(k);value=raw?JSON.parse(raw):inMemory.get(k);}
  catch{value=inMemory.get(k);}
  if(!valid(value,now)){
    inMemory.delete(k);
    try{storage()?.removeItem(k);}catch{}
    return null;
  }
  return value;
}
export function getOrCreateDirectSendAttempt(
  ownerId:string,chatId:string,body:string,replyId:string|null,now=Date.now()
):DirectSendAttempt{
  const text=body.trim();
  if(!UUID.test(ownerId)||!UUID.test(chatId)||!text||text.length>4000
     ||(replyId!==null&&!UUID.test(replyId)))throw Error('Некорректный черновик.');
  const old=readDirectSendAttempt(ownerId,chatId,now);
  if(old?.body===text&&old.replyId===replyId)return old;
  const value:DirectSendAttempt={id:crypto.randomUUID(),body:text,replyId,createdAt:now};
  const k=key(ownerId,chatId);
  inMemory.set(k,value);
  try{storage()?.setItem(k,JSON.stringify(value));}catch{}
  return value;
}
/** Late acknowledgment for an old attempt cannot clear a newer draft. */
export function clearDirectSendAttempt(ownerId:string,chatId:string,id:string):void{
  if(!UUID.test(ownerId)||!UUID.test(chatId)||!UUID.test(id))return;
  const existing=readDirectSendAttempt(ownerId,chatId);
  if(existing?.id!==id)return;
  const k=key(ownerId,chatId);
  inMemory.delete(k);
  try{storage()?.removeItem(k);}catch{}
}
export function clearAllDirectSendAttempts(ownerId:string):void{
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
  }catch{}
}
