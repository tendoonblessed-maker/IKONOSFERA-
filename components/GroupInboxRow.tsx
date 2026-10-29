'use client';
import type {Group,GroupOverview} from '@/lib/groups';
type Props={group:Group;overview?:GroupOverview;draft?:string;active:boolean;onOpen:()=>void};
function timeLabel(input:string|null|undefined){
 if(!input)return '';
 const d=new Date(input);if(!Number.isFinite(d.getTime()))return '';
 const now=new Date();if(d.toDateString()===now.toDateString())return d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
 const yesterday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1);
 if(d.toDateString()===yesterday.toDateString())return 'вчера';
 return d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});
}
export default function GroupInboxRow({group,overview,draft,active,onOpen}:Props){
 const unread=Math.max(0,Number(overview?.unread_count||0));
 return <button type="button" className={'chat-item group-chat-row ik-group-inbox'+(active?' active':'')} onClick={onOpen}>
   <span className="contact-avatar ik-group-avatar"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.4"/><path d="M2.5 20v-2.2c0-3.5 2.8-5.4 6.5-5.4s6.5 1.9 6.5 5.4V20M16 5.2c2.3 0 4 1.5 4 3.7s-1.7 3.7-4 3.7M17.5 13.5c2.5.6 4 2.3 4 5.3V20"/></svg></span>
   <span className="contact-info ik-group-inbox-text"><strong>{group.title}</strong><small>{draft?.trim()?<><span className="ik-group-draft-label">Черновик:</span> {draft.trim()}</>:(overview?.last_body?.trim()||'Группа · '+(overview?.member_count??'')+' участников')}</small></span>
   <span className="ik-group-inbox-meta"><time dateTime={overview?.last_created_at||undefined}>{timeLabel(overview?.last_created_at)}</time>{unread>0&&<span className="ik-unread-count">{unread>99?'99+':unread}</span>}</span>
 </button>;
}
