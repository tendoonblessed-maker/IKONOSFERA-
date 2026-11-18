/** Fail closed when a presence RPC returns an unknown or malformed status. */
export type UserActivity={user_id:string;status:string;last_seen_at:string|null};

const APPROXIMATE_STATUSES=new Set([
 'в сети','был недавно','был на этой неделе','был в этом году','был давно'
]);
const FALLBACK='был давно';
const FUTURE_TOLERANCE_MS=5*60*1000;

export function activityLabel(value:unknown,now=new Date()):string{
 if(!value||typeof value!=='object'||Array.isArray(value))return FALLBACK;
 const record=value as Record<string,unknown>;
 const status=record.status;
 if(typeof status!=='string')return FALLBACK;
 if(APPROXIMATE_STATUSES.has(status))return status;
 if(status!=='exact'||typeof record.last_seen_at!=='string')return FALLBACK;
 const date=new Date(record.last_seen_at);
 if(!Number.isFinite(date.getTime())||date.getTime()>now.getTime()+FUTURE_TOLERANCE_MS)return FALLBACK;
 const time=date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
 if(date.toDateString()===now.toDateString())return 'был сегодня в '+time;
 const yesterday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1);
 if(date.toDateString()===yesterday.toDateString())return 'был вчера в '+time;
 return 'был '+date.toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'})+' в '+time;
}
