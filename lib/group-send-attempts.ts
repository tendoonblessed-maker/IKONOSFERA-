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
// null is an acknowledged attempt whose storage deletion may have failed.
const inMemory=new Map<string,GroupSendAttempt|null>();

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
 // The latest attempt in this tab is authoritative. A failed setItem may
 // leave an older (still valid) ID in sessionStorage: preferring it would
 // assign a fresh ID on every retry and could duplicate a delivered message.
 const live=inMemory.get(k);
 if(live===null&&inMemory.has(k))return null; // Do not revive an acknowledged ID.
 if(live&&valid(live,now))return live;
 inMemory.delete(k);
 let candidate:unknown;
 try{
  const raw=storage()?.getItem(k);
  candidate=raw?JSON.parse(raw):null;
 }catch{candidate=null;}
 if(!valid(candidate,now)){
  try{storage()?.removeItem(k);}catch{}
  return null;
 }
 inMemory.set(k,candidate);
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
 const attempt:GroupSendAttempt={id:crypto.randomUUID(),body:trimmed,createdAt:now};
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
 // Keep a tombstone until the next intentional send: removeItem can throw,
 // leaving a valid old UUID that must not be reused for a later message.
 inMemory.set(k,null);
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
