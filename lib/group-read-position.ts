import type {GroupMessage} from './groups';

export type GroupMessageOrder=Pick<GroupMessage,'created_at'|'id'>;

function subMillisecondFraction(timestamp:string):number{
 const fraction=/\.(\d{1,6})/.exec(timestamp)?.[1]??'';
 return Number(fraction.padEnd(6,'0'));
}

/** Match the timeline's stable timestamp + UUID order, including microseconds. */
function compareGroupMessageOrder(a:GroupMessageOrder,b:GroupMessageOrder):number{
 const milliseconds=Date.parse(a.created_at)-Date.parse(b.created_at);
 if(milliseconds!==0)return milliseconds;
 const fraction=subMillisecondFraction(a.created_at)-subMillisecondFraction(b.created_at);
 return fraction||a.id.localeCompare(b.id);
}

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

/** Count newly arrived OTHER-user messages only while reading older history. */
export function countNewIncomingBelow(
 latest:GroupMessage[],
 previousIds:Set<string>,
 readerId:string,
 atBottom:boolean,
 previousNewest:GroupMessageOrder|null
):number{
 // A prepended history page also contains unseen IDs, but those rows are
 // older than the viewport and must never inflate the "new below" badge.
 if(atBottom||previousIds.size===0||!previousNewest)return 0;
 return latest.reduce((count,message)=>{
  if(previousIds.has(message.id)||message.sender_id===readerId)return count;
  return compareGroupMessageOrder(message,previousNewest)>0?count+1:count;
 },0);
}
