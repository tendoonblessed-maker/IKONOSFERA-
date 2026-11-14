/**
 * Lightweight, pure link detection for chat text. URLs are not fetched, parsed
 * as HTML, or sent to a link-preview service. The React renderer handles
 * escaping: strings like "a < b", code, and literal tags stay literal text.
 */
export type ChatTextPart={text:string;href?:string};
const LINK_CANDIDATE=/(?:https?:\/\/|www\.)[^\s<>"'\u0060]+/gi;
const TRAILING_PUNCTUATION=/[.,!?;:…。，！？；：»”’›]$/u;
// Unicode format and default-ignorable code points can change visual order or
// disappear during rendering. Keep such candidates literal, not clickable.
const UNSAFE_LINK_FORMATTING=/[\p{Cf}\p{Default_Ignorable_Code_Point}]/u;
// WHATWG URL normalizes raw backslashes and can percent-encode control bytes.
// Percent-encoded path text remains supported; raw host encoding is rejected below.
const UNSAFE_LINK_SYNTAX=/[\\\p{Cc}]/u;
const MAX_URL_LENGTH=2048;
const MAX_LINKS=40;

function trailingCount(value:string,letter:string):number{
 let total=0;
 for(const char of value)if(char===letter)total++;
 return total;
}

function splitEnding(candidate:string):{url:string;ending:string}{
 let url=candidate;
 while(url){
  const final=url.at(-1)!;
  const unbalancedClose=final===')'
   ?trailingCount(url,')')>trailingCount(url,'(')
   :final===']'
    ?trailingCount(url,']')>trailingCount(url,'[')
    :final==='}'
     ?trailingCount(url,'}')>trailingCount(url,'{')
     :false;
  if(!TRAILING_PUNCTUATION.test(final)&&!unbalancedClose)break;
  url=url.slice(0,-1);
 }
 return {url,ending:candidate.slice(url.length)};
}

function splitAuthority(authority:string):{hostname:string;port?:string}|null{
 // Even empty user-info (https://@host) is needlessly ambiguous in chat.
 if(!authority||authority.includes('@'))return null;
 let hostname=authority;
 let port:string|undefined;
 if(authority.startsWith('[')){
  const closing=authority.indexOf(']');
  if(closing<0)return null;
  hostname=authority.slice(0,closing+1);
  const suffix=authority.slice(closing+1);
  if(suffix){
   if(!suffix.startsWith(':'))return null;
   port=suffix.slice(1);
  }
 }else{
  const colon=authority.lastIndexOf(':');
  if(colon>=0){
   hostname=authority.slice(0,colon);
   port=authority.slice(colon+1);
  }
 }
 // URL accepts and normalizes ports with leading zeroes and empty ports.
 // Require one unambiguous decimal spelling so the visible authority agrees
 // with the destination represented by the generated href.
 if(port!==undefined&&(!/^(?:0|[1-9]\d{0,4})$/.test(port)||Number(port)>65535))return null;
 return {hostname,port};
}

function externalHref(candidate:string):string|null{
 if(candidate.length>MAX_URL_LENGTH||UNSAFE_LINK_FORMATTING.test(candidate)||UNSAFE_LINK_SYNTAX.test(candidate))return null;
 const prefixed=/^www\./i.test(candidate)?'https://'+candidate:candidate;
 try{
  const parsed=new URL(prefixed);
  if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')return null;
  // User-info URLs disguise the destination's actual domain.
  if(parsed.username||parsed.password)return null;
  if(!parsed.hostname||parsed.hostname.startsWith('.')||parsed.hostname.endsWith('.'))return null;
  if(parsed.hostname.includes('%'))return null;
  if(/^www\./i.test(candidate)&&!parsed.hostname.includes('.'))return null;
  // WHATWG URL applies IDNA mapping before exposing hostname: Unicode dot
  // separators, full-width ASCII and percent-encoded host bytes can become
  // an apparently ordinary ASCII hostname. Inspect the original authority
  // before normalization so the visible text and actual destination agree.
  const authority=prefixed.match(/^https?:\/\/([^/?#]*)/i)?.[1];
  if(!authority)return null;
  const authorityParts=splitAuthority(authority);
  if(!authorityParts)return null;
  const rawHostname=authorityParts.hostname;
  if(!rawHostname||/[^\x00-\x7f]/.test(rawHostname)||rawHostname.includes('%'))return null;
  // WHATWG removes literal and percent-encoded dot segments from URL paths.
  // That can make the browser open a different visible path than the message
  // shows (for example /public/../account). Keep such candidates as plain text.
  const rawPath=prefixed.match(/^https?:\/\/[^/?#]*(\/[^?#]*)?/i)?.[1]??'';
  const hasDotSegment=rawPath.split('/').some(segment=>{
   const dotsOnly=segment.replace(/%2e/ig,'.');
   return dotsOnly==='.'||dotsOnly==='..';
  });
  if(hasDotSegment)return null;
  // WHATWG rewrites dotted-decimal IPv4 tails in IPv6 literals to hexadecimal
  // groups, including IPv4-compatible and translation-prefix addresses. The
  // visible label would then differ from the serialized destination.
  if(rawHostname.startsWith('[')&&rawHostname.includes('.'))return null;
  // WHATWG serializes IPv4-mapped IPv6 (including hexadecimal input) as
  // hexadecimal groups. Keep mapped addresses literal in message text.
  if(/^\[::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}\]$/i.test(parsed.hostname))return null;
  // The bubble renders the original hostname verbatim. IDN homographs can
  // resemble trusted ASCII domains while resolving to a different punycode host.
  // Keep internationalized hostnames literal until the UI can show a safe label.
  if(parsed.hostname.split('.').some(label=>label.startsWith('xn--')))return null;
  // WHATWG URL accepts legacy IPv4 spellings (127.1, octal, hex and a
  // single integer) and silently rewrites them to dotted decimal. The chat
  // bubble shows the original text, so only allow an exact canonical IPv4
  // spelling when the parser has normalized the hostname to an IPv4 address.
  if(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname)){
   const octets=rawHostname.split('.');
   const canonical=octets.length===4
    &&octets.every(part=>/^(?:0|[1-9]\d{0,2})$/.test(part)&&Number(part)<=255)
    &&rawHostname===parsed.hostname;
   if(!canonical)return null;
  }
  return parsed.href;
 }catch{return null;}
}

function canBeginLink(text:string,index:number):boolean{
 if(index===0)return true;
 // Don't link inside emails, identifiers or already-open URI schemes.
 return !/[\p{L}\p{N}_@/:.-]/u.test(text[index-1]);
}

/**
 * Detect only HTTP(S) addresses (and www. shorthand upgraded to HTTPS).
 * Preserve punctuation, whitespace, line breaks and original characters.
 */
export function splitChatLinks(text:string):ChatTextPart[]{
 if(!text)return [{text:''}];
 const result:ChatTextPart[]=[];
 let cursor=0,linkCount=0;
 LINK_CANDIDATE.lastIndex=0;
 for(const match of text.matchAll(LINK_CANDIDATE)){
  if(linkCount>=MAX_LINKS)break;
  const start=match.index;
  if(start<cursor||!canBeginLink(text,start))continue;
  const {url}=splitEnding(match[0]);
  const href=externalHref(url);
  if(!href)continue;
  if(start>cursor)result.push({text:text.slice(cursor,start)});
  result.push({text:url,href});
  cursor=start+url.length;
  linkCount++;
 }
 if(cursor<text.length)result.push({text:text.slice(cursor)});
 return result.length?result:[{text}];
}
