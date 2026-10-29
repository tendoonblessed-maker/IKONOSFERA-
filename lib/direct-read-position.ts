import type {ChatMessage} from './supabase-rest';

type DirectReadRow=Pick<ChatMessage,'id'|'chat_id'|'sender_id'|'read_at'|'deleted_for'>;

/** Fetched messages aren't viewed until the newest committed page is visible. */
export function shouldAcknowledgeDirectRead(
  rows:DirectReadRow[],chatId:string,viewerId:string,
  followingNewest:boolean,atBottom:boolean,visible:boolean
):boolean{
  return Boolean(chatId&&viewerId&&followingNewest&&atBottom&&visible
    &&rows.length>0
    &&rows.every(row=>row.chat_id===chatId)
    &&rows.some(row=>row.sender_id!==viewerId&&!row.read_at
      &&!row.deleted_for?.includes(viewerId)));
}

/** Count newly observed incoming IDs from the latest server window only. */
export function countNewDirectMessagesBelow(
  latest:DirectReadRow[],previousIds:Set<string>,
  viewerId:string,chatId:string,followingNewest:boolean
):number{
  if(followingNewest||previousIds.size===0||!chatId||!viewerId)return 0;
  return latest.reduce((count,row)=>count+(
    row.chat_id===chatId&&row.sender_id!==viewerId&&!previousIds.has(row.id)
      &&!row.deleted_for?.includes(viewerId)?1:0
  ),0);
}
