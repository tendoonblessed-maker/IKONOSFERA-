const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
export const CHANNEL_COMMENT_PAGE_SIZE=50;
export type ChannelCommentCursor={id:string;created_at:string};

/** Fetch newest comments first; the extra row is a has-more sentinel. */
export function channelCommentsPagePath(postId:string,before?:ChannelCommentCursor):string{
 if(!UUID.test(postId))throw Error("Некорректный идентификатор публикации.");
 const params=new URLSearchParams({
  select:"*",
  post_id:"eq."+postId,
  order:"created_at.desc,id.desc",
  limit:String(CHANNEL_COMMENT_PAGE_SIZE+1)
 });
 if(before){
  if(!UUID.test(before.id)||!TIMESTAMP.test(before.created_at)||!Number.isFinite(Date.parse(before.created_at))){
   throw Error("Некорректный курсор комментариев.");
  }
  params.set("or","(created_at.lt."+before.created_at+",and(created_at.eq."+before.created_at+",id.lt."+before.id+"))");
 }
 return "/rest/v1/channel_comments?"+params.toString();
}

/** Prepend older rows while keeping already displayed versions authoritative. */
export function prependOlderChannelComments<T extends {id:string}>(current:T[],older:T[]):T[]{
 const result:T[]=[];
 const seen=new Set(current.map(comment=>comment.id));
 for(const comment of older){
  if(seen.has(comment.id))continue;
  seen.add(comment.id);
  result.push(comment);
 }
 return [...result,...current];
}
