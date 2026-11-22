/**
 * Lightweight, pure link detection for chat text. URLs are not fetched, parsed
 * as HTML, or sent to a link-preview service. The React renderer handles
 * escaping: strings like "a < b", code, and literal tags stay literal text.
 */
export type ChatTextPart={text:string;href?:string};
const LINK_CANDIDATE=/(?:https?:\\/\\/|www\\.)[^\\s<>"'\\u0060]+/gi;
const TRAILING_PUNCTUATION=/[.,!?;:…。，！？；：»”’›]$/u;
const MAX_URL_LENGTH=2048;
const MAX_LINKS=40;
const LOCAL_HOST_SUFFIXES=[
 '.localhost',
 '.local',
 '.lan',
 '.home',
 '.internal',
 '.intranet',
 '.corp',
 '.home.arpa',
 '.test',
 '.invalid',
 '.example'
] as const;

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

function isNonPublicIPv4(hostname:string):boolean{
 const octets=hostname.split('.').map(Number);
 if(octets.length!==4||octets.some(octet=>!Number.isInteger(octet)||octet<0||octet>255))return false;
 const [a,b,c]=octets;
 return a===0
  ||a===10
  ||a===127
  ||(a===169&&b===254)
  ||(a===172&&b>=16&&b<=31)
  ||(a===100&&b>=64&&b<=127)
  ||(a===192&&b===0&&c===0)
  ||(a===192&&b===0&&c===2)
  ||(a===192&&b===88&&c===99)
  ||(a===192&&b===168)
  ||(a===198&&(b===18||b===19))
  ||(a===198&&b===51&&c===100)
  ||(a===203&&b===0&&c===113)
  ||a>=224;
}

function isLocalOrNonPublicHost(hostname:string):boolean{
 const host=hostname.toLowerCase();
 // IPv6 literals are deliberately left as plain text. This conservative rule
 // avoids auto-linking loopback, link-local, unique-local and mapped addresses.
 if(host.startsWith('['))return true;
 if(!host.includes('.'))return true;
 if(host.startsWith('.')||host.endsWith('.'))return true;
 if(LOCAL_HOST_SUFFIXES.some(suffix=>host.endsWith(suffix)))return true;
 // WHATWG URL normalizes many non-decimal IPv4 forms (127.1, octal, hex and
 // single-integer hosts). Reject any remaining numeric-looking host that is
 // not a canonical dotted quad to avoid browser reinterpretation differences.
 const numericHost=/^(?:0x[0-9a-f]+|[0-9]+)(?:\\.(?:0x[0-9a-f]+|[0-9]+))*$/i;
 const canonicalIPv4=/^[0-9]{1,3}(?:\\.[0-9]{1,3}){3}$/;
 if(numericHost.test(host)&&!canonicalIPv4.test(host))return true;
 return isNonPublicIPv4(host);
}

function externalHref(candidate:string):string|null{
 if(candidate.length>MAX_URL_LENGTH)return null;
 const prefixed=/^www\\./i.test(candidate)?'https://'+candidate:candidate;
 try{
  const parsed=new URL(prefixed);
  if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')return null;
  // User-info URLs disguise the destination's actual domain.
  if(parsed.username||parsed.password)return null;
  if(!parsed.hostname||parsed.hostname.startsWith('.')||parsed.hostname.endsWith('.'))return null;
  if(parsed.hostname.includes('%'))return null;
  if(/^www\\./i.test(candidate)&&!parsed.hostname.includes('.'))return null;
  if(isLocalOrNonPublicHost(parsed.hostname))return null;
  return parsed.href;
 }catch{return null;}
}

function canBeginLink(text:string,index:number):boolean{
 if(index===0)return true;
 // Don't link inside emails, identifiers or already-open URI schemes.
 return !/[\\p{L}\\p{N}_@/.-]/u.test(text[index-1]);
}

/**
 * Detect only public HTTP(S) addresses (and www. shorthand upgraded to HTTPS).
 * Local/private IP literals and local hostnames stay plain text. Preserve
 * punctuation, whitespace, line breaks and original characters.
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
