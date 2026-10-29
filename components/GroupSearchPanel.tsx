'use client';

import type {GroupMessage} from '@/lib/groups';
import {normalizeGroupSearch} from '@/lib/group-search';

type Props={
 query:string;
 onQueryChange:(value:string)=>void;
 onClose:()=>void;
 results:GroupMessage[];
 loading:boolean;
 error:string;
 hasMore:boolean;
 onMore:()=>void;
 onOpen:(message:GroupMessage)=>void;
 locatingId:string|null;
 ownerId:string;
 names:Record<string,string>;
};

function shortExcerpt(body:string,query:string):string{
 const flat=body.replace(/\s+/g,' ').trim();
 const index=flat.toLocaleLowerCase('ru').indexOf(query.toLocaleLowerCase('ru'));
 const start=index<0?0:Math.max(0,index-45);
 return (start>0?'…':'')+flat.slice(start,start+180)+(flat.length>start+180?'…':'');
}

export default function GroupSearchPanel({
 query,onQueryChange,onClose,results,loading,error,hasMore,onMore,onOpen,
 locatingId,ownerId,names
}:Props){
 const term=normalizeGroupSearch(query);
 return <section className="ik-group-search" aria-label="Поиск по истории группы">
  <div className="ik-group-search-bar">
   <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
    strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
   <input autoFocus type="search" aria-label="Найти сообщение в группе"
    placeholder="Поиск по всей истории группы…" maxLength={120}
    value={query} onChange={e=>onQueryChange(e.target.value)}/>
   <button type="button" className="ik-group-search-close" aria-label="Закрыть поиск"
    onClick={onClose}>✕</button>
  </div>
  <div className="ik-group-search-summary" aria-live="polite">
   {term.length<2?'Введите хотя бы 2 символа':
    loading&&!results.length?'Ищем сообщения…':
    error||(!loading?results.length+(hasMore?'+':'')+' найдено':'Загружаем ещё…')}
  </div>
  {term.length>=2&&<div className="ik-group-search-results"
   aria-busy={loading} aria-label="Найденные сообщения">
   {results.map(message=><button className="ik-group-search-result" type="button" key={message.id}
    disabled={Boolean(locatingId)} onClick={()=>onOpen(message)}>
    <span className="ik-group-search-result-head">
     <strong>{message.sender_id===ownerId?'Вы':names[message.sender_id]||'Участник'}</strong>
     <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleDateString('ru-RU',{
      day:'numeric',month:'short',year:'numeric'
     })}</time>
    </span>
    <span className="ik-group-search-snippet">{shortExcerpt(message.body,term)}</span>
    <span className="ik-group-search-arrow" aria-hidden="true">{locatingId===message.id?'◌':'›'}</span>
   </button>)}
   {!loading&&!error&&!results.length&&<p className="ik-group-search-empty">Сообщений не найдено.</p>}
   {error&&<div className="ik-group-search-error" role="alert">{error}<button type="button"
    onClick={onMore}>Повторить</button></div>}
   {hasMore&&!loading&&!error&&<button className="ik-group-search-more"
    type="button" onClick={onMore}>Показать ещё</button>}
  </div>}
 </section>;
}
