'use client';

import {imageUrl} from '@/lib/social';
import FloatingActionMenu from '@/components/FloatingActionMenu';
import StatusEmoji from '@/components/StatusEmoji';
import type {ChatPreview,DirectChat,Profile} from '@/lib/supabase-rest';

type Row={chat:DirectChat;other:Profile|null;preview:ChatPreview|null};
type Props={
 row:Row;
 currentUserId:string;
 active:boolean;
 selectionMode?:boolean;
 selectedForBulk?:boolean;
 isSavedContact?:boolean;
 isBlocked?:boolean;
 onOpen:()=>void;
 onContactAction:()=>void;
 onBlockAction:()=>void;
 onAction:(action:'hide'|'pin'|'unpin'|'delete_self'|'delete_everyone')=>void;
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

export default function ChatInboxRow({row,currentUserId,active,selectionMode=false,selectedForBulk=false,isSavedContact=false,isBlocked=false,onOpen,onContactAction,onBlockAction,onAction}:Props){
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
       <span className="ik-chat-title"><strong className="ik-name-with-status"><span>{name}</span><StatusEmoji index={other?.status_emoji} decorative/></strong>{pinned&&<span className="ik-pin-mark" title="Закреплён"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 3 6 6-3 1-3 3-4-4 3-3zM9 11 3 21l10-6M9 11l4 4"/></svg></span>}</span>
       <span className="ik-chat-preview">{lastText}</span>
     </span>
     <span className="ik-chat-meta">
       {stamp&&<time dateTime={preview?.last_created_at||undefined}>{stamp}</time>}
       {unread>0&&<span className="ik-unread-count" aria-label={'Непрочитанных: '+unread}>{unread>99?'99+':unread}</span>}
     </span>
   </button>
   {!selectionMode&&<FloatingActionMenu
     label={'Действия с чатом '+name}
     wrapperClassName="chat-row-menu ik-chat-row-menu"
     triggerClassName="ik-chat-row-trigger"
     popupClassName="chat-row-actions ik-floating-chat-actions"
     trigger={<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>}>
       {other&&<button type="button" onClick={onContactAction}>{isSavedContact?'Удалить из контактов':'Добавить в контакты'}</button>}
       <button type="button" onClick={()=>onAction(pinned?'unpin':'pin')}>{pinned?'Открепить чат':'Закрепить чат'}</button>
       {other&&<button type="button" onClick={onBlockAction}>{isBlocked?'Разблокировать':'Заблокировать пользователя'}</button>}
       <button type="button" onClick={()=>onAction('delete_self')}>Удалить только у себя</button>
       <button type="button" className="ik-danger-menu-action" onClick={()=>onAction('delete_everyone')}>Удалить у обоих</button>
   </FloatingActionMenu>}
 </div>;
}
