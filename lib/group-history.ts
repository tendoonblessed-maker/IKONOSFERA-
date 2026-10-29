import type {GroupMessage} from './groups';

export const CONFIRMED_GROUP_MESSAGE_GRACE_MS=60_000;
export type ConfirmedGroupMessage={message:GroupMessage;expiresAt:number};

/**
 * The latest server page wins except for DB-confirmed sends not yet visible
 * in an older in-flight GET. Keep their actual server rows temporarily; never
 * fabricate optimistic messages or leak sends between accounts/groups.
 */
export function mergeConfirmedGroupMessages(
 latest:GroupMessage[],
 confirmations:Map<string,ConfirmedGroupMessage>,
 groupId:string,
 userId:string,
 now=Date.now()
):GroupMessage[]{
 const latestIds=new Set(latest.map(item=>item.id));
 for(const [id,entry] of confirmations){
  if(entry.expiresAt<=now||(
    entry.message.group_id===groupId
    &&entry.message.sender_id===userId
    &&latestIds.has(id)
  ))confirmations.delete(id);
 }
 const byId=new Map<string,GroupMessage>();
 for(const entry of confirmations.values()){
  if(entry.message.group_id===groupId&&entry.message.sender_id===userId){
   byId.set(entry.message.id,entry.message);
  }
 }
 for(const message of latest)byId.set(message.id,message);
 return Array.from(byId.values()).sort((a,b)=>
  Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id)
 );
}
