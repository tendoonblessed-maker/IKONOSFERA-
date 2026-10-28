'use client';
import type {Group,GroupOverview} from '@/lib/groups';
type Props={group:Group;overview?:GroupOverview;active:boolean;onOpen:()=>void};
function timeLabel(input:string|null|undefined){
 if(!input)return '';
 const d=new Date(input);if(!Number.isFinite(d.getTime()))return '';
 const now=new Date();if(d.toDateString()===now.toDateString())return d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
 const yesterday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1);
 if(d.toDateString()===yesterday.toDateString())return 'вчера';
 return d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});
}
export default function GroupInboxRow({group,overview,active,onOpen}:Props){
 const unread=Math.max(0,Number(overview?.unread_count||0));
 return <button type="button" className={'chat-item group-chat-row ik-group-inbox'+(active?' active':'')} onClick={onOpen}>
   <span className="contact-avatar ik-group-avatar">♧</span>
   <span className="contact-info ik-group-inbox-text"><strong>{group.title}</strong><small>{overview?.last_body?.trim()||'Группа · '+(overview?.member_count??'')+' участников'}</small></span>
   <span className="ik-group-inbox-meta"><time dateTime={overview?.last_created_at||undefined}>{timeLabel(overview?.last_created_at)}</time>{unread>0&&<span className="ik-unread-count">{unread>99?'99+':unread}</span>}</span>
 </button>;
}
