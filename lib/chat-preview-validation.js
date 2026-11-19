const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MEDIA_TYPES=new Set(['image','video','audio','file']);
const TIMESTAMP=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;
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

function isTimestamp(value){
 if(typeof value!=='string')return false;
 const match=TIMESTAMP.exec(value);
 if(!match)return false;
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
 const hour=Number(match[4]),minute=Number(match[5]),second=Number(match[6]);
 if(month<1||month>12||hour>23||minute>59||second>59)return false;
 const leap=year%4===0&&(year%100!==0||year%400===0);
 const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(day<1||day>days[month-1])return false;
 if(match[10]!==undefined){
  const offsetHour=Number(match[10]),offsetMinute=Number(match[11]);
  if(offsetHour>23||offsetMinute>59)return false;
 }
 return Number.isFinite(Date.parse(value));
}

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
  if(row.last_created_at!==null&&!isTimestamp(row.last_created_at))invalid();
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
