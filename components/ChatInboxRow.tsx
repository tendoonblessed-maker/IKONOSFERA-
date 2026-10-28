'use client';

import {imageUrl} from '@/lib/social';
import type {ChatPreview,DirectChat,Profile} from '@/lib/supabase-rest';

type Row={chat:DirectChat;other:Profile|null;preview:ChatPreview|null};
type Props={
 row:Row;
 currentUserId:string;
 active:boolean;
 selectionMode?:boolean;
 selectedForBulk?:boolean;
 onOpen:()=>void;
 onAction:(action:'hide'|'pin'|'unpin'|'delete_everyone')=>void;
};

function timeLabel(input:string|null){
 if(!input)return '';
 const date=new Date(input);
 if(!Number.isFinite(date.getTime()))return '';
 const today=new Date();
 if(date.toDateString()===today.toDateString())
   return date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
 const yesterday=new Date(today.getFullYear(),today.getMonth(),today.getDate()-1);
 if(date.toDateString()===yesterday.toDateString())return 'вчера';
 return date.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});
}

export default function ChatInboxRow({row,currentUserId,active,selectionMode=false,selectedForBulk=false,onOpen,onAction}:Props){
 const {chat,other,preview}=row;
 const pinned=Boolean(chat.pinned_for?.includes(currentUserId));
 const unread=Math.max(0,Number(preview?.unread_count||0));
 const previewText=preview?.last_body?.trim()||'Начало переписки';
 const outgoing=preview?.last_sender_id===currentUserId;
 const lastText=outgoing?'Вы: '+previewText:previewText;
 const name=other?.display_name||other?.username||'Собеседник';
 const stamp=timeLabel(preview?.last_created_at||null);
 return <div className={'chat-row-wrap ik-inbox-row'+(active?' active':'')+(selectionMode?' ik-chat-selecting':'')}>
   {selectionMode&&<span className={'ik-chat-checkbox'+(selectedForBulk?' checked':'')} aria-hidden="true">{selectedForBulk?'✓':''}</span>}
   <button type="button" className={'chat-item telegram-chat-row'+(active?' active':'')} onClick={onOpen} aria-label={(selectionMode?'Выбрать чат с ':'Открыть чат с ')+name} aria-pressed={selectionMode?selectedForBulk:undefined}>
     <span className="contact-avatar">{imageUrl(other?.avatar_path)?<img className="avatar-image" src={imageUrl(other?.avatar_path)||''} alt=""/>:name.slice(0,1).toUpperCase()}</span>
     <span className="contact-info">
       <span className="ik-chat-title"><strong>{name}</strong>{pinned&&<span className="ik-pin-mark" title="Закреплён">◆</span>}</span>
       <span className="ik-chat-preview">{lastText}</span>
     </span>
     <span className="ik-chat-meta">
       {stamp&&<time dateTime={preview?.last_created_at||undefined}>{stamp}</time>}
       {unread>0&&<span className="ik-unread-count" aria-label={'Непрочитанных: '+unread}>{unread>99?'99+':unread}</span>}
     </span>
   </button>
   {!selectionMode&&<details className="chat-row-menu ik-chat-row-menu">
     <summary aria-label={'Действия с чатом '+name} title="Управление чатом">···</summary>
     <div className="chat-row-actions">
       <button type="button" onClick={()=>onAction(pinned?'unpin':'pin')}>{pinned?'Открепить':'Закрепить'}</button>
       <button type="button" onClick={()=>onAction('hide')}>Скрыть у себя</button>
       <button type="button" onClick={()=>onAction('delete_everyone')}>Удалить у всех</button>
     </div>
   </details>}
 </div>;
}
