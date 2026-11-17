'use client';

import {useLayoutEffect,useRef} from 'react';
import type {DirectMessageSearchResult} from '@/lib/supabase-rest';

type Props={
  query:string;
  onQueryChange:(value:string)=>void;
  onClose:()=>void;
  results:DirectMessageSearchResult[];
  loading:boolean;
  failed:boolean;
  hasMore:boolean;
  onMore:()=>void;
  onOpen:(id:string)=>void;
  userId:string;
  partnerName:string;
  locatingId:string|null;
};

/** Results are server-scoped to one private chat; never display another
 * account's cached search snippets after switching conversations. */
export default function DirectMessageSearchPanel({
  query,onQueryChange,onClose,results,loading,failed,hasMore,onMore,
  onOpen,userId,partnerName,locatingId
}:Props){
  const needle=query.trim();
  const inputRef=useRef<HTMLInputElement|null>(null);
  const panelRef=useRef<HTMLElement|null>(null);
  const previousFocusRef=useRef<HTMLElement|null>(null);

  useLayoutEffect(()=>{
    const active=document.activeElement;
    previousFocusRef.current=active instanceof HTMLElement?active:null;
    inputRef.current?.focus();
    return()=>{
      const target=previousFocusRef.current;
      const panel=panelRef.current;
      const active=document.activeElement;
      // Do not steal focus if another control (for example, a dialog opened
      // above the chat) received it while search was mounted.
      if(target?.isConnected&&panel?.contains(active))target.focus();
      previousFocusRef.current=null;
    };
  },[]);

  return <section ref={panelRef} className="ik-direct-search" aria-label="Поиск по всей переписке"
    onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}
    }}>
    <div className="ik-conversation-search">
      <input ref={inputRef} aria-label="Поиск сообщений в текущем чате"
        placeholder="Поиск по всей истории…" maxLength={120} value={query}
        onChange={event=>onQueryChange(event.target.value)}/>
      <span role="status" aria-live="polite">{needle.length<2?'От 2 символов':loading?'Ищем…':failed?'Ошибка':results.length+(hasMore?'+':'')+' найдено'}</span>
      <button type="button" aria-label="Закрыть поиск" onClick={onClose}>✕</button>
    </div>
    {needle.length>=2&&<div className="ik-direct-search-results" role="region" aria-label="Результаты поиска" aria-busy={loading}>
      {results.map(message=>{
        const full=message.body.replace(/\s+/g,' ').trim();
        const index=full.toLocaleLowerCase('ru').indexOf(needle.toLocaleLowerCase('ru'));
        const start=index<0?0:Math.max(0,index-38);
        const snippet=full.slice(start,start+210);
        const isLocating=locatingId===message.id;
        return <button type="button" key={message.id} className="ik-direct-search-result"
          disabled={Boolean(locatingId)} onClick={()=>onOpen(message.id)}>
          <span className="ik-direct-search-result-head">
            <strong>{message.sender_id===userId?'Вы':partnerName}</strong>
            <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'})}</time>
          </span>
          <span className="ik-direct-search-result-text">{start>0?'…':''}{snippet}{full.length>start+210?'…':''}</span>
          <span className="ik-direct-search-result-arrow" aria-hidden="true">{isLocating?'◌':'›'}</span>
        </button>;
      })}
      {loading&&<p className="ik-direct-search-hint" role="status">Ищем сообщения…</p>}
      {failed&&!loading&&<button type="button" className="ik-direct-search-retry" onClick={onMore}>Не удалось найти сообщения. Повторить</button>}
      {!loading&&!failed&&!results.length&&<p className="ik-direct-search-hint">По этому запросу сообщений не найдено.</p>}
      {!loading&&!failed&&hasMore&&<button type="button" className="ik-direct-search-more" onClick={onMore}>Показать ещё совпадения</button>}
    </div>}
  </section>;
}
