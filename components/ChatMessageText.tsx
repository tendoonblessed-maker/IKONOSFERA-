import {Fragment} from 'react';
import {splitChatLinks} from '@/lib/chat-links';

/**
 * Plain text stays plain text. React escapes all message content and the
 * parser emits only vetted HTTP(S) hrefs, never arbitrary markup/HTML.
 */
export default function ChatMessageText({text}:{text:string}){
 return <span className="ik-message-rich-text">{
  splitChatLinks(text).map((part,i)=>part.href
   ?<a key={i} href={part.href} target="_blank"
      rel="noopener noreferrer nofollow ugc"
      onClick={event=>event.stopPropagation()}>{part.text}</a>
   :<Fragment key={i}>{part.text}</Fragment>)
 }</span>;
}
