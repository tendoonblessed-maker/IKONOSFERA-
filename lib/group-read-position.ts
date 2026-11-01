import type {GroupMessage} from './groups';

/**
 * Reading group history must not acknowledge new incoming messages that
 * aren't on screen. A successful read must represent the last visible page.
 */
export function shouldAcknowledgeGroupRead(
 latestId:string|null,
 lastAcknowledgedId:string|null,
 atBottom:boolean,
 visible:boolean
):boolean{
 return Boolean(latestId&&latestId!==lastAcknowledgedId&&atBottom&&visible);
}

type GroupCursor=Pick<GroupMessage,'id'|'created_at'>;

/** PostgreSQL compares microseconds, not the millisecond precision of Date.
 * An older page prepended to the timeline must never count as a new message.
 * The UUID is the server's stable tie-breaker for equal timestamps.
 */
function newerThanCursor(message:GroupMessage,cursor:GroupCursor):boolean{
 const millis=Date.parse(message.created_at)-Date.parse(cursor.created_at);
 if(millis!==0)return millis>0;
 const fraction=(stamp:string)=>Number(
  (/\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/i.exec(stamp)?.[1]??'').padEnd(6,'0')
 );
 const micros=fraction(message.created_at)-fraction(cursor.created_at);
 return micros!==0?micros>0:message.id.localeCompare(cursor.id)>0;
}

/** Count only genuinely NEW incoming messages newer than the last observed
 * message. Previously unseen older pages are not incoming notifications.
 */
export function countNewIncomingBelow(
 latest:GroupMessage[],
 previousIds:Set<string>,
 readerId:string,
 atBottom:boolean,
 previousNewest:GroupCursor|null
):number{
 if(atBottom||previousIds.size===0||!previousNewest)return 0;
 return latest.reduce((n,m)=>n+(
  !previousIds.has(m.id)&&m.sender_id!==readerId&&newerThanCursor(m,previousNewest)?1:0
 ),0);
}
