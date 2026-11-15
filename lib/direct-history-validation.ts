export type DirectHistoryCursor={id:string;created_at:string};

export const DIRECT_HISTORY_PAGE_MAX=100;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const MEDIA_TYPES=new Set(['image','video','audio','file']);

function invalidPage():never{
 throw new Error('Не удалось загрузить историю переписки. Повторите попытку.');
}
function isTimestamp(value:unknown):value is string{
 return typeof value==='string'&&TIMESTAMP.test(value)&&Number.isFinite(Date.parse(value));
}
function isUuid(value:unknown):value is string{
 return typeof value==='string'&&UUID.test(value);
}
function compareUuid(a:string,b:string):number{
 const left=a.toLowerCase(),right=b.toLowerCase();
 return left<right?-1:left>right?1:0;
}
function own(row:Record<string,unknown>,key:string):boolean{
 return Object.prototype.hasOwnProperty.call(row,key);
}

export function assertDirectHistoryChatId(chatId:string):void{
 if(!isUuid(chatId))throw new Error('Некорректный идентификатор переписки.');
}
export function assertDirectHistoryCursor(chatId:string,before:DirectHistoryCursor):void{
 assertDirectHistoryChatId(chatId);
 if(!before||!isUuid(before.id)||!isTimestamp(before.created_at))
  throw new Error('Некорректный курсор истории переписки.');
}

/**
 * Treat a PostgREST page as one snapshot: never silently filter a malformed,
 * foreign, duplicated, oversized or obviously out-of-order direct-chat page.
 * Distinct fractional timestamps that collapse to one JavaScript millisecond
 * are not re-sorted here; the server cursor remains authoritative for those ties.
 */
export function validateDirectMessagePage<T=Record<string,unknown>>(
 payload:unknown,
 chatId:string,
 before?:DirectHistoryCursor
):T[]{
 assertDirectHistoryChatId(chatId);
 if(before)assertDirectHistoryCursor(chatId,before);
 if(!Array.isArray(payload)||payload.length>DIRECT_HISTORY_PAGE_MAX)invalidPage();

 const rows:Record<string,unknown>[]=[];
 const seen=new Set<string>();
 const cursorMs=before?Date.parse(before.created_at):null;

 for(const value of payload){
  if(!value||typeof value!=='object'||Array.isArray(value))invalidPage();
  const row=value as Record<string,unknown>;
  if(!isUuid(row.id)||!isUuid(row.chat_id)||row.chat_id.toLowerCase()!==chatId.toLowerCase()
    ||!isUuid(row.sender_id)||typeof row.body!=='string'||!isTimestamp(row.created_at)
    ||!(row.media_path===null||typeof row.media_path==='string')
    ||!(row.media_type===null||(typeof row.media_type==='string'&&MEDIA_TYPES.has(row.media_type)))
    ||!(row.read_at===null||isTimestamp(row.read_at)))invalidPage();

  if(own(row,'edited_at')&&row.edited_at!==null&&!isTimestamp(row.edited_at))invalidPage();
  if(own(row,'deleted_for')&&row.deleted_for!==null
    &&(!Array.isArray(row.deleted_for)||row.deleted_for.some(id=>!isUuid(id))))invalidPage();
  if(own(row,'deleted_for_everyone')&&typeof row.deleted_for_everyone!=='boolean')invalidPage();
  if(own(row,'reply_to_message_id')&&row.reply_to_message_id!==null&&!isUuid(row.reply_to_message_id))invalidPage();

  const id=row.id.toLowerCase();
  if(seen.has(id))invalidPage();
  seen.add(id);

  const currentMs=Date.parse(row.created_at);
  const previous=rows[rows.length-1];
  if(previous){
   const previousMs=Date.parse(previous.created_at as string);
   if(previousMs<currentMs)invalidPage();
   if(previousMs===currentMs&&previous.created_at===row.created_at
     &&compareUuid(previous.id as string,row.id)>=0)invalidPage();
  }
  if(cursorMs!==null){
   if(currentMs>cursorMs)invalidPage();
   if(currentMs===cursorMs&&row.created_at===before!.created_at
     &&compareUuid(row.id,before!.id)>=0)invalidPage();
  }
  rows.push(row);
 }
 return rows as T[];
}
