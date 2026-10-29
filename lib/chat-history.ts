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
