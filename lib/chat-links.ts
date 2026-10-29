/**
 * Lightweight, pure link detection for chat text. URLs are not fetched, parsed
 * as HTML, or sent to a link-preview service. The React renderer handles
 * escaping: strings like "a < b", code, and literal tags stay literal text.
 */
export type ChatTextPart={text:string;href?:string};
const LINK_CANDIDATE=/(?:https?:\/\/|www\.)[^\s<>"'\u0060]+/gi;
const TRAILING_PUNCTUATION=/[.,!?;:…。，！？；：]$/u;
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

function externalHref(candidate:string):string|null{
 if(candidate.length>MAX_URL_LENGTH)return null;
 const prefixed=/^www\./i.test(candidate)?'https://'+candidate:candidate;
 try{
  const parsed=new URL(prefixed);
  if(parsed.protocol!=='http:'&&parsed.protocol!=='https:')return null;
  // User-info URLs disguise the destination's actual domain.
  if(parsed.username||parsed.password)return null;
  if(!parsed.hostname||parsed.hostname.startsWith('.')||parsed.hostname.endsWith('.'))return null;
  if(parsed.hostname.includes('%'))return null;
  if(/^www\./i.test(candidate)&&!parsed.hostname.includes('.'))return null;
  return parsed.href;
 }catch{return null;}
}

function canBeginLink(text:string,index:number):boolean{
 if(index===0)return true;
 // Don't link inside emails, identifiers or already-open URI schemes.
 return !/[\p{L}\p{N}_@/.-]/u.test(text[index-1]);
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
