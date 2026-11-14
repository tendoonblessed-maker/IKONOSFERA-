import {slicePreviewText,truncatePreviewText} from './text-preview';

function localeInsensitiveIndex(value:string,query:string):number{
 const needle=query.toLocaleLowerCase('ru');
 if(!needle)return -1;
 let folded='';
 const originalOffsets:number[]=[];
 let offset=0;
 for(const point of value){
  const lower=point.toLocaleLowerCase('ru');
  folded+=lower;
  for(let i=0;i<lower.length;i++)originalOffsets.push(offset);
  offset+=point.length;
 }
 const match=folded.indexOf(needle);
 return match<0?-1:originalOffsets[match]??-1;
}

/** Build a bounded private-chat search excerpt without splitting graphemes. */
export function directMessageSearchExcerpt(body:string,query:string):string{
 const flat=body.replace(/\s+/g,' ').trim();
 if(!flat)return '';
 const index=localeInsensitiveIndex(flat,query.trim());
 const targetStart=index<0?0:Math.max(0,index-38);
 const prefix=truncatePreviewText(flat,targetStart);
 const start=prefix.length;
 const excerpt=slicePreviewText(flat,start,210);
 return (start>0?'…':'')+excerpt+(start+excerpt.length<flat.length?'…':'');
}
