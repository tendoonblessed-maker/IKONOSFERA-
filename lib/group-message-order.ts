import type {GroupMessage} from '@/lib/groups';

/** Compare PostgreSQL timestamptz values without losing fractional precision. */
function subMillisecondFraction(timestamp:string):number{
 const part=/\.(\d{1,6})/.exec(timestamp)?.[1]??'';
 return Number(part.padEnd(6,'0'));
}

export function compareGroupMessages(a:GroupMessage,b:GroupMessage):number{
 const milli=Date.parse(a.created_at)-Date.parse(b.created_at);
 if(milli!==0)return milli;
 const fraction=subMillisecondFraction(a.created_at)-subMillisecondFraction(b.created_at);
 return fraction||a.id.localeCompare(b.id);
}
