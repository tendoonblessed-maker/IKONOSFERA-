export const REACTION_EMOJIS=['👍🏻','👎🏻','✌🏻','👌🏻','🖕🏻','🫶🏻','🕊️'] as const;
export type MessageReactionRecord={message_id:string;user_id:string;emoji:string};

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedEmoji=new Set<string>(REACTION_EMOJIS);

/** Normalize an untrusted PostgREST reaction payload to the requested messages only. */
export function normalizeMessageReactions(raw:unknown,requestedMessageIds:readonly string[]):MessageReactionRecord[]{
 if(!Array.isArray(raw)||!requestedMessageIds.length)return [];
 const requested=new Set(requestedMessageIds.filter(id=>typeof id==='string'&&UUID.test(id)).map(id=>id.toLowerCase()));
 if(!requested.size)return [];
 const seen=new Set<string>();
 const result:MessageReactionRecord[]=[];
 for(const item of raw){
  if(!item||typeof item!=='object'||Array.isArray(item))continue;
  const row=item as Record<string,unknown>;
  const messageId=row.message_id,userId=row.user_id,emoji=row.emoji;
  if(typeof messageId!=='string'||!UUID.test(messageId))continue;
  const normalizedMessageId=messageId.toLowerCase();
  if(!requested.has(normalizedMessageId))continue;
  if(typeof userId!=='string'||!UUID.test(userId))continue;
  if(typeof emoji!=='string'||!allowedEmoji.has(emoji))continue;
  const normalizedUserId=userId.toLowerCase();
  const key=normalizedMessageId+':'+normalizedUserId;
  if(seen.has(key))continue;
  seen.add(key);
  result.push({message_id:normalizedMessageId,user_id:normalizedUserId,emoji});
 }
 return result;
}
