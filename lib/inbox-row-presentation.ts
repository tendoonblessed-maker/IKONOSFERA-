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

/** The preview RPC returns the caption alone for media with captions. Keep the
 * attachment type visible in the inbox, and do not mistake an empty caption
 * for an empty conversation. Deleted-message text must remain authoritative.
 */
export type DirectInboxPreview={
 last_body:string|null;
 last_media_type:string|null;
 last_created_at:string|null;
};
const MEDIA_LABELS={
 image:{icon:'📷',label:'Фото'},
 video:{icon:'🎬',label:'Видео'},
 audio:{icon:'🎤',label:'Аудио'},
 file:{icon:'📎',label:'Файл'}
} as const;
export function directInboxPreviewText(preview:DirectInboxPreview|null,unavailable=false):string {
 if(!preview)return unavailable?'Не удалось обновить сообщения':'Начало переписки';
 const body=preview.last_body?.trim()??'';
 if(body==='Сообщение удалено')return body;
 const kind=preview.last_media_type;
 const media=kind&&Object.prototype.hasOwnProperty.call(MEDIA_LABELS,kind)
  ?MEDIA_LABELS[kind as keyof typeof MEDIA_LABELS]:null;
 if(media)return media.icon+' '+media.label+(body&&body!==media.label?': '+body:'');
 if(body)return body;
 if(unavailable)return 'Не удалось обновить сообщения';
 return preview.last_created_at?'Сообщение':'Начало переписки';
}
