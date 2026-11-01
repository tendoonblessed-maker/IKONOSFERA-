/** Shared Telegram-like inbox timestamp labels, using the viewer's local timezone. */
export function inboxTimestamp(input:string|null|undefined,now=new Date()):{short:string;full:string;iso:string}|null {
 if(!input)return null;
 const date=new Date(input);
 if(!Number.isFinite(date.getTime()))return null;
 const midnight=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 const yesterday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1);
 const short=date>=midnight&&date<=now
   ?date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})
   :date>=yesterday&&date<midnight
     ?'вчера'
     :date.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});
 return {
  short,
  full:date.toLocaleString('ru-RU',{year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}),
  iso:date.toISOString(),
 };
}
