const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MEDIA_TYPES=new Set(['image','video','audio','file']);
const TIMESTAMP=/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?(?:Z|[+-]\\d{2}:\\d{2})$/;
const MAX_CHAT_PREVIEW_ROWS=100;

/**
 * @typedef {Object} ChatPreviewRow
 * @property {string} chat_id
 * @property {string|null} last_body
 * @property {string|null} last_created_at
 * @property {'image'|'video'|'audio'|'file'|null} last_media_type
 * @property {string|null} last_sender_id
 * @property {number} unread_count
 */

/** Validate the complete RPC payload before it can update the inbox cache.
 * @param {unknown} input
 * @returns {ChatPreviewRow[]}
 */
export function validateChatPreviewRows(input){
 const invalid=()=>{throw new Error('Некорректный ответ списка чатов');};
 if(!Array.isArray(input)||input.length>MAX_CHAT_PREVIEW_ROWS)invalid();
 const seen=new Set();
 for(const row of input){
  if(!row||typeof row!=='object'||Array.isArray(row))invalid();
  if(typeof row.chat_id!=='string'||!UUID.test(row.chat_id))invalid();
  const chatId=row.chat_id.toLowerCase();
  if(seen.has(chatId))invalid();
  seen.add(chatId);
  if(row.last_body!==null&&typeof row.last_body!=='string')invalid();
  if(row.last_created_at!==null&&(
   typeof row.last_created_at!=='string'
   ||!TIMESTAMP.test(row.last_created_at)
   ||!Number.isFinite(Date.parse(row.last_created_at))
  ))invalid();
  if(row.last_media_type!==null&&!MEDIA_TYPES.has(row.last_media_type))invalid();
  if(row.last_sender_id!==null&&(typeof row.last_sender_id!=='string'||!UUID.test(row.last_sender_id)))invalid();
  if(!Number.isSafeInteger(row.unread_count)||row.unread_count<0)invalid();
  // The RPC returns null metadata only for a chat with no visible messages.
  if(row.last_created_at===null){
   if(row.last_body!==null||row.last_media_type!==null||row.last_sender_id!==null||row.unread_count!==0)invalid();
  }else if(row.last_sender_id===null){
   invalid();
  }
 }
 return input;
}
