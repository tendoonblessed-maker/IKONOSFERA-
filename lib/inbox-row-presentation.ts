/** Shared, defensive inbox presentation for direct and group chats. */
export function inboxUnreadCount(value:unknown):number {
 const count=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):0;
 return Number.isFinite(count)&&count>0?Math.min(Number.MAX_SAFE_INTEGER,Math.floor(count)):0;
}

export function inboxUnreadBadge(count:number):string {
 return count>99?'99+':String(count);
}

export function inboxRowLabel(name:string,unread:number,selectionMode=false,selected=false):string {
 const action=selectionMode?(selected?'Снять выбор чата с':'Выбрать чат с'):'Открыть чат с';
 return action+' '+name+(unread>0?'. Непрочитанных сообщений: '+unread:'');
}
