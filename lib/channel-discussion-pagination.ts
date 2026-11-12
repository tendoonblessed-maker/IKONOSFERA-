import {apiUrl,anonKey} from '@/lib/supabase-rest';

export const CHANNEL_DISCUSSION_PAGE_SIZE=50;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export type DiscussionFeedCursor={
 created_at:string;
 id:string;
 kind:'message'|'comment';
};
export type DiscussionMessage={
 id:string;
 channel_id:string;
 author_id:string;
 body:string;
 created_at:string;
};
export type DiscussionComment={
 id:string;
 post_id:string;
 author_id:string;
 body:string;
 created_at:string;
 channel_posts:{body:string;channel_id:string}|null;
};
export type DiscussionFeedItem=
 | (DiscussionMessage & {kind:'message'})
 | (DiscussionComment & {kind:'comment'});
export type DiscussionFeedPage={
 items:DiscussionFeedItem[];
 cursor:DiscussionFeedCursor|null;
 hasMore:boolean;
};

function kindRank(kind:'message'|'comment'):number{
 return kind==='message'?0:1;
}
function subMillisecondFraction(timestamp:string):number{
 const part=/\.(\d{1,6})/.exec(timestamp)?.[1]??'';
 return Number(part.padEnd(6,'0'));
}
export function compareDiscussionFeedItems(a:DiscussionFeedItem,b:DiscussionFeedItem):number{
 const millis=Date.parse(a.created_at)-Date.parse(b.created_at);
 if(millis!==0)return millis;
 const fraction=subMillisecondFraction(a.created_at)-subMillisecondFraction(b.created_at);
 if(fraction!==0)return fraction;
 const id=a.id.localeCompare(b.id);
 return id||kindRank(a.kind)-kindRank(b.kind);
}

/** Build one RLS-scoped keyset query for either source of the combined feed. */
export function discussionPagePath(
 kind:'message'|'comment',
 channelId:string,
 cursor?:DiscussionFeedCursor
):string{
 if(!UUID.test(channelId))throw Error('Некорректный канал обсуждения.');
 const path=kind==='message'?'/rest/v1/channel_discussion_messages':'/rest/v1/channel_comments';
 const params=new URLSearchParams();
 params.set('select',kind==='message'
  ?'id,channel_id,author_id,body,created_at'
  :'id,post_id,author_id,body,created_at,channel_posts!inner(body,channel_id)');
 params.set(kind==='message'?'channel_id':'channel_posts.channel_id','eq.'+channelId);
 params.set('order','created_at.desc,id.desc');
 params.set('limit',String(CHANNEL_DISCUSSION_PAGE_SIZE+1));
 if(cursor){
  if(!UUID.test(cursor.id)||!TIMESTAMP.test(cursor.created_at)||!Number.isFinite(Date.parse(cursor.created_at))
    ||(cursor.kind!=='message'&&cursor.kind!=='comment')){
   throw Error('Некорректный курсор обсуждения.');
  }
  // At an identical timestamp+UUID, a message sorts before a comment.
  // Include that message when the cursor is the comment at the same key.
  const operator=kindRank(kind)<kindRank(cursor.kind)?'lte':'lt';
  const conditions='(created_at.lt.'+cursor.created_at+',and(created_at.eq.'+cursor.created_at+',id.'+operator+'.'+cursor.id+'))';
  params.set('or',conditions);
 }
 return path+'?'+params.toString();
}

export function mergeDiscussionFeedItems(
 current:readonly DiscussionFeedItem[],
 older:readonly DiscussionFeedItem[]
):DiscussionFeedItem[]{
 const rows=new Map<string,DiscussionFeedItem>();
 for(const item of older)rows.set(item.kind+':'+item.id,item);
 // Already visible rows win if a page overlaps a concurrent refresh.
 for(const item of current)rows.set(item.kind+':'+item.id,item);
 return Array.from(rows.values()).sort(compareDiscussionFeedItems);
}

async function requestRows<T>(path:string,token:string,signal:AbortSignal):Promise<T[]>{
 const response=await fetch(apiUrl+path,{
  method:'GET',
  headers:{apikey:anonKey,Authorization:'Bearer '+token},
  cache:'no-store',
  signal
 });
 const value:unknown=await response.json().catch(()=>null);
 if(!response.ok||!Array.isArray(value)){
  const details=value as {message?:string;error?:string;msg?:string}|null;
  throw Error(details?.message||details?.error||details?.msg||'Не удалось загрузить обсуждение канала.');
 }
 return value as T[];
}

/** Fetch the latest merged page, or the next strictly older page, from both sources. */
export async function listDiscussionFeedPage(
 token:string,
 channelId:string,
 cursor?:DiscussionFeedCursor,
 externalSignal?:AbortSignal
):Promise<DiscussionFeedPage>{
 if(!token)throw Error('Необходима авторизация для загрузки обсуждения.');
 const controller=new AbortController();
 let timedOut=false;
 const timeout=setTimeout(()=>{timedOut=true;controller.abort();},18000);
 const abort=()=>controller.abort();
 if(externalSignal?.aborted)controller.abort();
 else externalSignal?.addEventListener('abort',abort,{once:true});
 try{
  const [messages,comments]=await Promise.all([
   requestRows<DiscussionMessage>(discussionPagePath('message',channelId,cursor),token,controller.signal),
   requestRows<DiscussionComment>(discussionPagePath('comment',channelId,cursor),token,controller.signal)
  ]);
  const rows:DiscussionFeedItem[]=[
   ...messages.filter(item=>item.channel_id===channelId).map(item=>({...item,kind:'message' as const})),
   ...comments.filter(item=>item.channel_posts?.channel_id===channelId).map(item=>({...item,kind:'comment' as const}))
  ];
  rows.sort((a,b)=>compareDiscussionFeedItems(b,a));
  const items=rows.slice(0,CHANNEL_DISCUSSION_PAGE_SIZE).reverse();
  const oldest=items[0];
  return {
   items,
   hasMore:rows.length>CHANNEL_DISCUSSION_PAGE_SIZE,
   cursor:oldest?{created_at:oldest.created_at,id:oldest.id,kind:oldest.kind}:null
  };
 }catch(error){
  controller.abort();
  if(timedOut)throw Error('Время ожидания загрузки обсуждения истекло.');
  throw error;
 }finally{
  clearTimeout(timeout);
  externalSignal?.removeEventListener('abort',abort);
 }
}
