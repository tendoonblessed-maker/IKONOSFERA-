import type {ChatMessage} from './supabase-rest';

/** Server orders pages by created_at.desc,id.desc; UI displays ascending. */
export function compareMessages(a:ChatMessage,b:ChatMessage):number{
  const timestampDiff=Date.parse(a.created_at)-Date.parse(b.created_at);
  return timestampDiff||a.id.localeCompare(b.id);
}

/** A recent poll is authoritative for its page, but must not erase older pages. */
export function mergeRecentPage(previous:ChatMessage[],latest:ChatMessage[],pageSize:number):ChatMessage[]{
  if(latest.length<pageSize)return latest;
  const first=latest[0]; // oldest row in chronological order
  return [
    ...previous.filter(message=>compareMessages(message,first)<0),
    ...latest
  ];
}

/** Merge an earlier page without duplicates or reordering newer messages. */
export function prependEarlierPage(current:ChatMessage[],earlier:ChatMessage[]):ChatMessage[]{
  const byId=new Map<string,ChatMessage>();
  for(const message of earlier)byId.set(message.id,message);
  for(const message of current)byId.set(message.id,message);
  return Array.from(byId.values()).sort(compareMessages);
}


/** A successful write returns the canonical DB row. A concurrent poll that
 * started before that write can temporarily return an older snapshot. Keep
 * these confirmed rows on screen until a read acknowledges them, bounded by
 * a short grace period, without inventing an optimistic/unconfirmed message. */
export const CONFIRMED_MESSAGE_GRACE_MS=60_000;
export type ConfirmedMessage={message:ChatMessage;expiresAt:number};

export function mergeConfirmedRecentPage(
 previous:ChatMessage[],
 latest:ChatMessage[],
 pageSize:number,
 confirmed:Map<string,ConfirmedMessage>,
 chatId:string,
 ownerId:string,
 now=Date.now()
):ChatMessage[]{
 const latestIds=new Set(latest.map(message=>message.id));
 for(const [id,entry] of confirmed){
  if(entry.expiresAt<=now || (
    entry.message.chat_id===chatId
    &&entry.message.sender_id===ownerId
    &&latestIds.has(id)
  ))confirmed.delete(id);
 }
 const merged=mergeRecentPage(previous,latest,pageSize);
 const outstanding=Array.from(confirmed.values())
  .filter(entry=>entry.message.chat_id===chatId&&entry.message.sender_id===ownerId)
  .map(entry=>entry.message);
 if(!outstanding.length)return merged;
 // Server rows win on duplicate IDs; never overwrite newer read receipts,
 // edits or deletions with the originally confirmed send response.
 return prependEarlierPage(outstanding,merged);
}

 
export const DIRECT_MESSAGE_RECONCILE_BATCH_SIZE=80;
export const DIRECT_MESSAGE_RECONCILE_COOLDOWN_MS=30_000;
const DIRECT_MESSAGE_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** IDs of message bubbles intersecting the visible history viewport, bounded per request. */
export function visibleDirectMessageIds(container:HTMLElement|null,limit=DIRECT_MESSAGE_RECONCILE_BATCH_SIZE):string[]{
 if(!container||!Number.isInteger(limit)||limit<1)return [];
 const viewport=container.getBoundingClientRect();
 if(!Number.isFinite(viewport.top)||!Number.isFinite(viewport.bottom)||viewport.bottom<=viewport.top)return [];
 const ids=new Set<string>();
 const prefix='ik-chat-message-';
 for(const node of container.querySelectorAll<HTMLElement>('[id^="ik-chat-message-"]')){
  const rect=node.getBoundingClientRect();
  if(!Number.isFinite(rect.top)||!Number.isFinite(rect.bottom)||rect.bottom<=viewport.top||rect.top>=viewport.bottom)continue;
  const id=node.id.slice(prefix.length);
  if(!DIRECT_MESSAGE_UUID.test(id))continue;
  ids.add(id.toLowerCase());
  if(ids.size>=Math.min(limit,DIRECT_MESSAGE_RECONCILE_BATCH_SIZE))break;
 }
 return Array.from(ids);
}

/**
 * Reconcile only the requested visible rows. Never append an unrequested row;
 * preserve a short-lived, DB-confirmed send if a concurrent read has not seen it yet.
 */
export function reconcileVisibleDirectMessages(
 current:ChatMessage[],
 requestedIds:string[],
 authoritative:ChatMessage[],
 chatId:string,
 ownerId:string,
 confirmed:Map<string,ConfirmedMessage>,
 now=Date.now()
):ChatMessage[]{
 const requested=new Set(requestedIds.map(id=>id.toLowerCase()));
 if(!requested.size)return current;
 const serverRows=new Map<string,ChatMessage>();
 for(const message of authoritative){
  const id=message.id.toLowerCase();
  // An unexpected row invalidates the whole snapshot; never treat it as proof of deletion.
  if(message.chat_id!==chatId||!requested.has(id))return current;
  serverRows.set(id,message);
 }
 let changed=false;
 const next:ChatMessage[]=[];
 for(const message of current){
  const id=message.id.toLowerCase();
  if(!requested.has(id)){next.push(message);continue;}
  const server=serverRows.get(id);
  if(server){
   confirmed.delete(message.id);
   confirmed.delete(id);
   next.push(server);
   if(server!==message)changed=true;
   continue;
  }
  const pending=confirmed.get(message.id)??confirmed.get(id);
  if(pending&&pending.expiresAt>now&&pending.message.chat_id===chatId&&pending.message.sender_id===ownerId){
   next.push(message);
   continue;
  }
  if(pending){confirmed.delete(message.id);confirmed.delete(id);}
  changed=true;
 }
 return changed?next:current;
}


/** Compare viewport message IDs as a set; DOM order changes alone need no new read. */
export function sameVisibleDirectMessageIds(
 previous:readonly string[]|null,
 next:readonly string[]
):boolean{
 if(!previous||previous.length!==next.length)return false;
 const ids=new Set(previous);
 return ids.size===next.length&&next.every(id=>ids.has(id));
}

/** Queue one fresh RLS snapshot when the reader moved to a different visible page. */
export function shouldQueueDirectHistoryReconcile(
 inFlightIds:readonly string[]|null,
 nextIds:readonly string[],
 force=false
):boolean{
 if(!nextIds.length)return false;
 return force||!sameVisibleDirectMessageIds(inFlightIds,nextIds);
}
