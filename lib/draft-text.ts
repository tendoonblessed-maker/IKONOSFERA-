/** Keep bounded chat drafts valid UTF-16 when truncating at the storage limit. */
export function truncateDraftText(text:string,maxLength:number):string{
 if(text.length<=maxLength)return text;
 const limit=Math.max(0,Math.floor(maxLength));
 let end=limit;
 const last=text.charCodeAt(end-1);
 // A high surrogate at the boundary belongs to the low surrogate just beyond it.
 if(last>=0xd800&&last<=0xdbff)end-=1;
 return text.slice(0,end);
}
