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
