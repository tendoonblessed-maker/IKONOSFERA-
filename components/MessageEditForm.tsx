'use client';

import {useId,useRef,useState,type FormEvent} from 'react';
import {messageEditShortcut} from '@/lib/message-edit-shortcuts';

type Props={
  value:string;
  onChange:(value:string)=>void;
  onSave:(body:string)=>Promise<void>;
  onCancel:()=>void;
};

/** Inline editor keeps message line breaks and does not submit on mobile Enter. */
export default function MessageEditForm({value,onChange,onSave,onCancel}:Props){
  const fieldId=useId();
  const [saving,setSaving]=useState(false);
  const savingRef=useRef(false);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    // A synchronous lock also covers two submits before React commits state.
    if(savingRef.current||!value.trim()||value.length>4000)return;
    savingRef.current=true;
    setSaving(true);
    try{await onSave(value);}
    finally{savingRef.current=false;setSaving(false);}
  }

  return <form className="message-edit-form ik-message-edit-form" onSubmit={event=>{void submit(event);}}>
    <label className="ik-message-edit-label" htmlFor={fieldId}>Редактировать сообщение</label>
    <textarea id={fieldId} aria-label="Текст редактируемого сообщения"
      autoFocus rows={3} maxLength={4000}
      value={value} disabled={saving}
      onChange={event=>onChange(event.target.value)}
      onInput={event=>{
        const field=event.currentTarget;
        field.style.height='auto';
        field.style.height=Math.min(field.scrollHeight,180)+'px';
      }}
      onKeyDown={event=>{
        const composing=event.nativeEvent.isComposing||event.nativeEvent.keyCode===229;
        const shortcut=messageEditShortcut({
          key:event.key,ctrlKey:event.ctrlKey,metaKey:event.metaKey,
          altKey:event.altKey,shiftKey:event.shiftKey,repeat:event.repeat,
          isComposing:composing,keyCode:event.nativeEvent.keyCode
        },savingRef.current);
        if(shortcut==='cancel'){
          event.preventDefault();
          onCancel();
        }else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)
          &&!event.altKey&&!event.shiftKey&&!composing){
          // Swallow auto-repeat and in-flight modified Enter, never submit twice.
          event.preventDefault();
          if(shortcut==='save'&&value.trim()&&value.length<=4000)
            event.currentTarget.form?.requestSubmit();
        }

      }}
    />
    <div className="ik-message-edit-footer">
      <small>Ctrl/⌘ + Enter — сохранить</small>
      <div className="ik-message-edit-actions">
        <button type="button" disabled={saving} onClick={onCancel}>Отмена</button>
        <button type="submit" disabled={saving||!value.trim()}>{saving?'Сохраняем…':'Сохранить'}</button>
      </div>
    </div>
  </form>;
}
