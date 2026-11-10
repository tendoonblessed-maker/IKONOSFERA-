const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
export const CHANNEL_POST_PAGE_SIZE=100;
export type ChannelPostCursor={id:string;created_at:string};

/** Stable PostgREST keyset cursor; the extra row is a has-more sentinel. */
export function channelPostsPagePath(channelId:string,before?:ChannelPostCursor):string{
 if(!UUID.test(channelId))throw Error("Некорректный идентификатор канала.");
 const params=new URLSearchParams({
  select:"*",
  channel_id:"eq."+channelId,
  order:"created_at.desc,id.desc",
  limit:String(CHANNEL_POST_PAGE_SIZE+1)
 });
 if(before){
  if(!UUID.test(before.id)||!TIMESTAMP.test(before.created_at)||!Number.isFinite(Date.parse(before.created_at))){
   throw Error("Некорректный курсор публикаций.");
  }
  params.set("or","(created_at.lt."+before.created_at+",and(created_at.eq."+before.created_at+",id.lt."+before.id+"))");
 }
 return "/rest/v1/channel_posts?"+params.toString();
}

/** Keep current rows authoritative when a fetched older page overlaps them. */
export function appendOlderChannelPosts<T extends {id:string}>(current:T[],older:T[]):T[]{
 const result=[...current];
 const seen=new Set(current.map(post=>post.id));
 for(const post of older){
  if(seen.has(post.id))continue;
  seen.add(post.id);
  result.push(post);
 }
 return result;
}
