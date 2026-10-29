'use client';

import {useId,useState,type FormEvent} from 'react';

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

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(saving||!value.trim()||value.length>4000)return;
    setSaving(true);
    try{await onSave(value);}
    finally{setSaving(false);}
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
        if(event.key==='Escape'){
          event.preventDefault();
          onCancel();
        }else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.nativeEvent.isComposing){
          event.preventDefault();
          if(value.trim()&&!saving)event.currentTarget.form?.requestSubmit();
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
