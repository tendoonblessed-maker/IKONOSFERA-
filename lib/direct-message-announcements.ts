import type {ChatMessage} from './supabase-rest';

export type DirectAnnouncementMessage=Pick<
 ChatMessage,'id'|'sender_id'|'deleted_for'|'deleted_for_everyone'
>;

export const DIRECT_ANNOUNCEMENT_SEEN_LIMIT=2000;

/** Count only unseen incoming rows; edits and read-receipt updates keep the same ID. */
export function countNewIncomingDirectMessages(
 messages:DirectAnnouncementMessage[],
 seenIds:ReadonlySet<string>,
 readerId:string
):number{
 if(!readerId)return 0;
 const considered=new Set(seenIds);
 let count=0;
 for(const message of messages){
  if(!message.id||considered.has(message.id))continue;
  considered.add(message.id);
  if(message.sender_id!==readerId
     &&message.deleted_for_everyone!==true
     &&!message.deleted_for?.includes(readerId))count++;
 }
 return count;
}

/** Keep a bounded per-open-chat ID window so removed rows do not look new on the next poll. */
export function rememberDirectMessageIds(
 seenIds:ReadonlySet<string>,
 messages:DirectAnnouncementMessage[],
 limit=DIRECT_ANNOUNCEMENT_SEEN_LIMIT
):Set<string>{
 const next=new Set(seenIds);
 for(const message of messages)if(message.id)next.add(message.id);
 const max=Number.isSafeInteger(limit)&&limit>0?limit:DIRECT_ANNOUNCEMENT_SEEN_LIMIT;
 while(next.size>max){
  const oldest=next.values().next().value;
  if(typeof oldest!=='string')break;
  next.delete(oldest);
 }
 return next;
}
