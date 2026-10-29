'use client';

import type {ReplyTarget} from '@/lib/supabase-rest';

type Props={
  target:ReplyTarget|null;
  senderName:string;
  onJump:()=>void;
  loading?:boolean;
};

/** Compact, keyboard-accessible reference within the reply bubble. */
export default function ReplyQuote({target,senderName,onJump,loading=false}:Props){
  const preview=loading?'Ищем сообщение в истории…':target?.deleted_for_everyone
    ? 'Сообщение удалено'
    : target?.body?.replace(/\s+/g,' ').trim().slice(0,140)
      || (target?.media_type?'Вложение':'Исходное сообщение недоступно');

  return <button type="button" className="ik-message-reply-reference"
    onClick={onJump} disabled={loading} aria-busy={loading} aria-label={'Перейти к сообщению: '+senderName}>
    <span className="ik-message-reply-line" aria-hidden="true"/>
    <span className="ik-message-reply-content">
      <strong>{senderName}</strong>
      <span>{preview}</span>
    </span>
  </button>;
}
